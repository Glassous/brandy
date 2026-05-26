package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/middleware"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

type RegisterReq struct {
	Username         string `json:"username" binding:"required,min=3,max=30"`
	Password         string `json:"password" binding:"required,min=6"`
	Nickname         string `json:"nickname"`
	SecurityQuestion string `json:"security_question" binding:"required"`
	SecurityAnswer   string `json:"security_answer" binding:"required"`
}

type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type ResetPasswordReq struct {
	Username       string `json:"username" binding:"required"`
	SecurityAnswer string `json:"security_answer" binding:"required"`
	NewPassword    string `json:"new_password" binding:"required,min=6"`
}

type UpdateProfileReq struct {
	Nickname string `json:"nickname" binding:"required,min=2,max=20"`
}

func Register(c *gin.Context) {
	var req RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	username := strings.TrimSpace(strings.ToLower(req.Username))
	collection := db.MongoDB.Collection("users")

	// Check if user exists
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existingUser models.User
	err := collection.FindOne(ctx, bson.M{"username": username}).Decode(&existingUser)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
		return
	} else if err != mongo.ErrNoDocuments {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Encrypt password
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt password"})
		return
	}

	// Encrypt security answer
	answerHash, err := bcrypt.GenerateFromPassword([]byte(strings.ToLower(strings.TrimSpace(req.SecurityAnswer))), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt security answer"})
		return
	}

	// Use user-provided nickname or auto allocate user UUID prefix nickname
	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		nickname = "User_" + uuid.New().String()[:8]
	}

	newUser := models.User{
		ID:                 primitive.NewObjectID(),
		Username:           username,
		PasswordHash:       string(pwdHash),
		Nickname:           nickname,
		SecurityQuestion:   req.SecurityQuestion,
		SecurityAnswerHash: string(answerHash),
		CreatedAt:          time.Now(),
	}

	_, err = collection.InsertOne(ctx, newUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register user"})
		return
	}

	// Generate JWT token
	token, err := middleware.GenerateToken(newUser.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user": models.UserResponse{
			ID:        newUser.ID.Hex(),
			Username:  newUser.Username,
			Nickname:  newUser.Nickname,
			Avatar:    newUser.Avatar,
			CreatedAt: newUser.CreatedAt,
		},
	})
}

func Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	username := strings.TrimSpace(strings.ToLower(req.Username))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := collection.FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	// Check password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	// Generate Token
	token, err := middleware.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": models.UserResponse{
			ID:        user.ID.Hex(),
			Username:  user.Username,
			Nickname:  user.Nickname,
			Avatar:    user.Avatar,
			CreatedAt: user.CreatedAt,
		},
	})
}

func GetSecurityQuestion(c *gin.Context) {
	username := strings.TrimSpace(strings.ToLower(c.Query("username")))
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username parameter is required"})
		return
	}

	collection := db.MongoDB.Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := collection.FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"security_question": user.SecurityQuestion,
	})
}

func ResetPassword(c *gin.Context) {
	var req ResetPasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	username := strings.TrimSpace(strings.ToLower(req.Username))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := collection.FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Validate answer
	err = bcrypt.CompareHashAndPassword([]byte(user.SecurityAnswerHash), []byte(strings.ToLower(strings.TrimSpace(req.SecurityAnswer))))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Security question answer is incorrect"})
		return
	}

	// Hash new password
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt new password"})
		return
	}

	// Update password in DB
	_, err = collection.UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"password_hash": string(pwdHash)}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password reset successfully"})
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
		ID:        user.ID.Hex(),
		Username:  user.Username,
		Nickname:  user.Nickname,
		Avatar:    user.Avatar,
		CreatedAt: user.CreatedAt,
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

	_, err = collection.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"nickname": strings.TrimSpace(req.Nickname)}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}
