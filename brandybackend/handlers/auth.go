package handlers

import (
	"context"
	"crypto/rand"
	"io"
	"net/http"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/middleware"
	"brandybackend/models"
	"brandybackend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

type RegisterReq struct {
	Username string `json:"username" binding:"required,min=3,max=30"`
	Password string `json:"password" binding:"required,min=6"`
	Nickname string `json:"nickname"`
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required,len=6"`
}

type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type SendCodeReq struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose" binding:"required,oneof=register login reset"`
}

type LoginCodeReq struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

type ResetPasswordReq struct {
	Email       string `json:"email" binding:"required,email"`
	Code        string `json:"code" binding:"required,len=6"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

type ChangePasswordReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

type UpdateProfileReq struct {
	Nickname           string `json:"nickname" binding:"required,min=2,max=20"`
	CustomTransferPath string `json:"custom_transfer_path"`
	Bio                string `json:"bio" binding:"max=100"`
	Gender             string `json:"gender"`
	Birthday           string `json:"birthday"`
	Country            string `json:"country"`
	City               string `json:"city"`
	Website            string `json:"website"`
	Job                string `json:"job"`
}

func generateCode() string {
	var table = [...]byte{'1', '2', '3', '4', '5', '6', '7', '8', '9', '0'}
	b := make([]byte, 6)
	n, err := io.ReadAtLeast(rand.Reader, b, 6)
	if n != 6 || err != nil {
		return "123456"
	}
	for i := 0; i < len(b); i++ {
		b[i] = table[int(b[i])%len(table)]
	}
	return string(b)
}

func SendVerificationCode(c *gin.Context) {
	var req SendCodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	purpose := req.Purpose

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("users")

	// Pre-checks based on purpose
	var existingUser models.User
	err := collection.FindOne(ctx, bson.M{"email": email}).Decode(&existingUser)
	if purpose == "register" {
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "该邮箱已被注册"})
			return
		}
	} else { // login or reset
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "该邮箱未绑定任何账户"})
			return
		}
	}

	// Generate 6-digit code
	code := generateCode()

	// Store in Redis with 10-minute expiry
	redisKey := "email_code:" + purpose + ":" + email
	err = db.RedisClient.Set(ctx, redisKey, code, 10*time.Minute).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "存储验证码失败，请稍后重试"})
		return
	}

	// Determine action text
	actionText := ""
	switch purpose {
	case "register":
		actionText = "用户注册"
	case "login":
		actionText = "快捷登录"
	case "reset":
		actionText = "找回密码"
	}

	// Send email
	err = utils.SendEmail(email, actionText, code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "邮件发送失败，请检查邮箱配置"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "验证码已成功发送至您的邮箱"})
}

func Register(c *gin.Context) {
	var req RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	username := strings.TrimSpace(strings.ToLower(req.Username))
	email := strings.TrimSpace(strings.ToLower(req.Email))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify code
	redisKey := "email_code:register:" + email
	storedCode, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil || storedCode != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误或已过期"})
		return
	}

	// Check if username exists
	var existingUser models.User
	err = collection.FindOne(ctx, bson.M{"username": username}).Decode(&existingUser)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已被占用"})
		return
	} else if err != mongo.ErrNoDocuments {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库查询异常"})
		return
	}

	// Check if email exists
	var existingEmail models.User
	err = collection.FindOne(ctx, bson.M{"email": email}).Decode(&existingEmail)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "该邮箱已被注册"})
		return
	}

	// Delete verification code
	db.RedisClient.Del(ctx, redisKey)

	// Encrypt password
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		nickname = "User_" + uuid.New().String()[:8]
	}

	newUser := models.User{
		ID:           primitive.NewObjectID(),
		Username:     username,
		PasswordHash: string(pwdHash),
		Nickname:     nickname,
		Email:        email,
		CreatedAt:    time.Now(),
	}

	_, err = collection.InsertOne(ctx, newUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "注册失败，请稍后重试"})
		return
	}

	// Generate JWT token
	token, err := middleware.GenerateToken(newUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user": models.UserResponse{
			ID:                 newUser.ID.Hex(),
			Username:           newUser.Username,
			Nickname:           newUser.Nickname,
			Avatar:             newUser.Avatar,
			CustomTransferPath: newUser.CustomTransferPath,
			Role:               newUser.Role,
			CreatedAt:          newUser.CreatedAt,
		},
	})
}

func Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	identifier := strings.TrimSpace(strings.ToLower(req.Username))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find user by either Username or Email
	var user models.User
	err := collection.FindOne(ctx, bson.M{
		"$or": []bson.M{
			{"username": identifier},
			{"email": identifier},
		},
	}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
		return
	}

	// Check password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
		return
	}

	// Generate Token
	token, err := middleware.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": models.UserResponse{
			ID:                 user.ID.Hex(),
			Username:           user.Username,
			Nickname:           user.Nickname,
			Avatar:             user.Avatar,
			CustomTransferPath: user.CustomTransferPath,
			Role:               user.Role,
			CreatedAt:          user.CreatedAt,
		},
	})
}

func LoginWithCode(c *gin.Context) {
	var req LoginCodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify code
	redisKey := "email_code:login:" + email
	storedCode, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil || storedCode != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误或已过期"})
		return
	}

	// Delete verification code
	db.RedisClient.Del(ctx, redisKey)

	// Find user
	collection := db.MongoDB.Collection("users")
	var user models.User
	err = collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "该邮箱未绑定任何账户"})
		return
	}

	// Generate Token
	token, err := middleware.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": models.UserResponse{
			ID:                 user.ID.Hex(),
			Username:           user.Username,
			Nickname:           user.Nickname,
			Avatar:             user.Avatar,
			CustomTransferPath: user.CustomTransferPath,
			Role:               user.Role,
			CreatedAt:          user.CreatedAt,
		},
	})
}

func ResetPassword(c *gin.Context) {
	var req ResetPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify code
	redisKey := "email_code:reset:" + email
	storedCode, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil || storedCode != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误或已过期"})
		return
	}

	// Find user
	var user models.User
	err = collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "该邮箱绑定的用户不存在"})
		return
	}

	// Delete verification code
	db.RedisClient.Del(ctx, redisKey)

	// Hash new password
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	// Update password in DB
	_, err = collection.UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"password_hash": string(pwdHash)}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重置密码失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "密码已重置成功"})
}

func ChangePassword(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req ChangePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	collection := db.MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get user
	var user models.User
	err = collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// Verify old password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "当前密码不正确"})
		return
	}

	// Hash new password
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加密新密码失败"})
		return
	}

	// Update password in DB
	_, err = collection.UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"password_hash": string(pwdHash)}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新密码失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "密码修改成功"})
}

func GetProfile(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	collection := db.MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err = collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, models.UserResponse{
		ID:                 user.ID.Hex(),
		Username:           user.Username,
		Nickname:           user.Nickname,
		Avatar:             user.Avatar,
		CustomTransferPath: user.CustomTransferPath,
		Role:               user.Role,
		CreatedAt:          user.CreatedAt,
		Bio:                user.Bio,
		Gender:             user.Gender,
		Birthday:           user.Birthday,
		Country:            user.Country,
		City:               user.City,
		Website:            user.Website,
		Job:                user.Job,
	})
}

func UpdateProfile(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req UpdateProfileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	collection := db.MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	updateFields := bson.M{
		"nickname":             strings.TrimSpace(req.Nickname),
		"custom_transfer_path": strings.TrimSpace(req.CustomTransferPath),
		"bio":                  strings.TrimSpace(req.Bio),
		"gender":               strings.TrimSpace(req.Gender),
		"birthday":             strings.TrimSpace(req.Birthday),
		"country":              strings.TrimSpace(req.Country),
		"city":                 strings.TrimSpace(req.City),
		"website":              strings.TrimSpace(req.Website),
		"job":                  strings.TrimSpace(req.Job),
	}

	_, err = collection.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": updateFields})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}
