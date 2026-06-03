package handlers

import (
	"context"
	"net/http"
	"os"
	"strconv"
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
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

type AdminRegisterReq struct {
	RegisterReq
	InvitationCode string `json:"invitation_code" binding:"required"`
}

// AdminRegister handles administrator account registration.
func AdminRegister(c *gin.Context) {
	var req AdminRegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Admin Invitation Code
	expectedCode := os.Getenv("ADMIN_INVITATION_CODE")
	if expectedCode == "" {
		expectedCode = "BrandyAdminSecret2026" // Safe default fallback
	}
	if req.InvitationCode != expectedCode {
		c.JSON(http.StatusForbidden, gin.H{"error": "注册邀请码不正确，拒绝注册管理员账号"})
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
		nickname = "Admin_" + uuid.New().String()[:8]
	}

	newUser := models.User{
		ID:           primitive.NewObjectID(),
		Username:     username,
		PasswordHash: string(pwdHash),
		Nickname:     nickname,
		Email:        email,
		Role:         "admin", // Force set role to admin
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

// AdminLogin handles administrator account login via password.
func AdminLogin(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	identifier := strings.TrimSpace(strings.ToLower(req.Username))
	collection := db.MongoDB.Collection("users")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

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

	// Enforce Admin role
	if user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "该账号非管理员账号，禁止在此登录"})
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

// AdminLoginCode handles administrator login via email verification code.
func AdminLoginCode(c *gin.Context) {
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

	// Enforce Admin role
	if user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "该账号非管理员账号，禁止在此登录"})
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

// GetSystemStats returns aggregate statistics for the dashboard.
func GetSystemStats(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userColl := db.MongoDB.Collection("users")
	groupColl := db.MongoDB.Collection("groups")
	msgColl := db.MongoDB.Collection("messages")

	totalUsers, _ := userColl.CountDocuments(ctx, bson.M{})
	totalGroups, _ := groupColl.CountDocuments(ctx, bson.M{})
	totalMessages, _ := msgColl.CountDocuments(ctx, bson.M{})

	// Disk items size aggregation
	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: nil},
			{Key: "totalSize", Value: bson.D{{Key: "$sum", Value: "$size"}}},
			{Key: "totalFiles", Value: bson.D{{Key: "$sum", Value: 1}}},
		}}},
	}
	
	// Default collection name in DB is usually lowercase plural or singular. Let's query "disk_items" or "diskitems"
	// Let's use disk_items as models.DiskItem name
	cursor, err := db.MongoDB.Collection("disk_items").Aggregate(ctx, pipeline)
	var totalDiskSize int64 = 0
	var totalDiskFiles int64 = 0
	if err == nil {
		var results []bson.M
		if err = cursor.All(ctx, &results); err == nil && len(results) > 0 {
			if sizeVal, ok := results[0]["totalSize"]; ok {
				if sizeNum, ok := sizeVal.(int64); ok {
					totalDiskSize = sizeNum
				} else if sizeFloat, ok := sizeVal.(float64); ok {
					totalDiskSize = int64(sizeFloat)
				} else if sizeInt, ok := sizeVal.(int32); ok {
					totalDiskSize = int64(sizeInt)
				}
			}
			if filesVal, ok := results[0]["totalFiles"]; ok {
				if filesNum, ok := filesVal.(int64); ok {
					totalDiskFiles = filesNum
				} else if filesInt, ok := filesVal.(int32); ok {
					totalDiskFiles = int64(filesInt)
				}
			}
		}
	}

	// Also count online WS clients if possible
	onlineUsers := len(GlobalHub.clients)

	c.JSON(http.StatusOK, gin.H{
		"total_users":      totalUsers,
		"total_groups":     totalGroups,
		"total_messages":   totalMessages,
		"total_disk_size":  totalDiskSize,
		"total_disk_files": totalDiskFiles,
		"online_users":     onlineUsers,
	})
}

// GetAdminUsers lists all users with pagination and search.
func GetAdminUsers(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	search := c.Query("search")

	if limit <= 0 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{}
	if search != "" {
		filter["$or"] = []bson.M{
			{"username": bson.M{"$regex": search, "$options": "i"}},
			{"nickname": bson.M{"$regex": search, "$options": "i"}},
			{"email": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	userColl := db.MongoDB.Collection("users")
	total, err := userColl.CountDocuments(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count users"})
		return
	}

	opts := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64((page - 1) * limit)).
		SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := userColl.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}
	defer cursor.Close(ctx)

	var users []models.User
	if err = cursor.All(ctx, &users); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode users"})
		return
	}

	userResponses := make([]models.UserResponse, 0, len(users))
	for _, u := range users {
		used, _ := calculateUsedSpace(ctx, u.ID)
		limit := int64(DiskLimit)
		userResponses = append(userResponses, models.UserResponse{
			ID:                 u.ID.Hex(),
			Username:           u.Username,
			Nickname:           u.Nickname,
			Avatar:             u.Avatar,
			CustomTransferPath: u.CustomTransferPath,
			Role:               u.Role,
			IsAI:               u.IsAI,
			DiskUsed:           &used,
			DiskLimit:          &limit,
			CreatedAt:          u.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"users": userResponses,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

type UpdateUserReq struct {
	Nickname string `json:"nickname" binding:"required,min=2,max=20"`
	Role     string `json:"role" binding:"required,oneof=admin user"`
}

// UpdateAdminUser updates user details.
func UpdateAdminUser(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req UpdateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userColl := db.MongoDB.Collection("users")

	// Ensure we don't accidentally remove the last admin
	if req.Role == "user" {
		var targetUser models.User
		err = userColl.FindOne(ctx, bson.M{"_id": userID}).Decode(&targetUser)
		if err == nil && targetUser.Role == "admin" {
			adminCount, _ := userColl.CountDocuments(ctx, bson.M{"role": "admin"})
			if adminCount <= 1 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "无法将唯一一位管理员降级为普通用户"})
				return
			}
		}
	}

	updateFields := bson.M{
		"nickname": strings.TrimSpace(req.Nickname),
		"role":     req.Role,
	}

	_, err = userColl.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": updateFields})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新用户信息失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "用户信息更新成功"})
}

// DeleteAdminUser deletes/bans a user.
func DeleteAdminUser(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userColl := db.MongoDB.Collection("users")

	// Verify if deleting admin
	var targetUser models.User
	err = userColl.FindOne(ctx, bson.M{"_id": userID}).Decode(&targetUser)
	if err == nil && targetUser.Role == "admin" {
		adminCount, _ := userColl.CountDocuments(ctx, bson.M{"role": "admin"})
		if adminCount <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无法删除唯一的一位管理员"})
			return
		}
	}

	// Delete user
	_, err = userColl.DeleteOne(ctx, bson.M{"_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除用户失败"})
		return
	}

	// Also delete user files, friendships, messages, etc. (soft or hard clean up)
	db.MongoDB.Collection("friends").DeleteMany(ctx, bson.M{
		"$or": []bson.M{
			{"user_id": userID},
			{"friend_id": userID},
		},
	})
	db.MongoDB.Collection("friend_requests").DeleteMany(ctx, bson.M{
		"$or": []bson.M{
			{"sender_id": userID},
			{"receiver_id": userID},
		},
	})
	db.MongoDB.Collection("disk_items").DeleteMany(ctx, bson.M{"user_id": userID})

	c.JSON(http.StatusOK, gin.H{"message": "用户删除成功"})
}

// GetAdminGroups lists all groups.
func GetAdminGroups(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	search := c.Query("search")

	if limit <= 0 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{}
	if search != "" {
		filter["name"] = bson.M{"$regex": search, "$options": "i"}
	}

	groupColl := db.MongoDB.Collection("groups")
	total, err := groupColl.CountDocuments(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count groups"})
		return
	}

	opts := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64((page - 1) * limit)).
		SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := groupColl.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch groups"})
		return
	}
	defer cursor.Close(ctx)

	var groups []models.Group
	if err = cursor.All(ctx, &groups); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode groups"})
		return
	}

	// Assemble detailed information
	userColl := db.MongoDB.Collection("users")
	groupResponses := make([]models.GroupResponse, 0, len(groups))
	for _, g := range groups {
		// Fetch members' details
		var members []models.UserResponse
		if len(g.Members) > 0 {
			cursorM, errM := userColl.Find(ctx, bson.M{"_id": bson.M{"$in": g.Members}})
			if errM == nil {
				var uList []models.User
				if cursorM.All(ctx, &uList) == nil {
					for _, u := range uList {
						members = append(members, models.UserResponse{
							ID:       u.ID.Hex(),
							Username: u.Username,
							Nickname: u.Nickname,
							Avatar:   u.Avatar,
						})
					}
				}
			}
		}

		adminStrs := make([]string, len(g.Admins))
		for i, aId := range g.Admins {
			adminStrs[i] = aId.Hex()
		}

		groupResponses = append(groupResponses, models.GroupResponse{
			ID:        g.ID.Hex(),
			Name:      g.Name,
			OwnerID:   g.OwnerID.Hex(),
			Admins:    adminStrs,
			Members:   members,
			CreatedAt: g.CreatedAt,
			Avatar:    g.Avatar,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"groups": groupResponses,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}

// DeleteAdminGroup disbands/deletes a group chat.
func DeleteAdminGroup(c *gin.Context) {
	idStr := c.Param("id")
	groupID, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的群组 ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = db.MongoDB.Collection("groups").DeleteOne(ctx, bson.M{"_id": groupID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解散群组失败"})
		return
	}

	// Also delete group messages
	db.MongoDB.Collection("messages").DeleteMany(ctx, bson.M{"group_id": groupID})
	db.MongoDB.Collection("aimembers").DeleteMany(ctx, bson.M{"group_id": groupID})

	c.JSON(http.StatusOK, gin.H{"message": "群组解散成功"})
}
