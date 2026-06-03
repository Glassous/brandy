package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"brandybackend/db"
	"brandybackend/middleware"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// QRState represents the stored state in Redis
type QRState struct {
	Status   string              `json:"status"` // unused, scanned, confirmed
	UserID   string              `json:"user_id,omitempty"`
	Nickname string              `json:"nickname,omitempty"`
	Avatar   string              `json:"avatar,omitempty"`
	Token    string              `json:"token,omitempty"`
	User     *models.UserResponse `json:"user,omitempty"`
}

type QRReq struct {
	UUID string `json:"uuid" binding:"required"`
}

// GetQRUUID generates a new UUID for web login QR code
func GetQRUUID(c *gin.Context) {
	newUUID := uuid.New().String()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	state := QRState{
		Status: "unused",
	}

	stateBytes, err := json.Marshal(state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化失败"})
		return
	}

	redisKey := "qr:login:" + newUUID
	err = db.RedisClient.Set(ctx, redisKey, stateBytes, 5*time.Minute).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "存储状态失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": gin.H{
			"uuid":       newUUID,
			"qr_url":     "brandy://qr-login?uuid=" + newUUID,
			"expired_at": time.Now().Add(5 * time.Minute).Format(time.RFC3339),
		},
	})
}

// GetQRStatus gets the QR code status for web polling
func GetQRStatus(c *gin.Context) {
	qrUUID := c.Query("uuid")
	if qrUUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 uuid 参数"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	redisKey := "qr:login:" + qrUUID
	stateBytes, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "二维码不存在或已过期"})
		return
	}

	var state QRState
	if err := json.Unmarshal([]byte(stateBytes), &state); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "反序列化失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": state,
	})
}

// ScanQR is called by mobile to notify web scanner scanned
func ScanQR(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req QRReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get User info from db
	collection := db.MongoDB.Collection("users")
	var user models.User
	err = collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	redisKey := "qr:login:" + req.UUID
	stateBytes, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "二维码已失效"})
		return
	}

	var state QRState
	if err := json.Unmarshal([]byte(stateBytes), &state); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "反序列化失败"})
		return
	}

	if state.Status != "unused" && state.Status != "scanned" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "二维码已被使用"})
		return
	}

	state.Status = "scanned"
	state.UserID = user.ID.Hex()
	state.Nickname = user.Nickname
	state.Avatar = user.Avatar

	newStateBytes, err := json.Marshal(state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化失败"})
		return
	}

	// Keep remaining expiration time or update TTL
	ttl, _ := db.RedisClient.TTL(ctx, redisKey).Result()
	if ttl <= 0 {
		ttl = 2 * time.Minute
	}
	db.RedisClient.Set(ctx, redisKey, newStateBytes, ttl)

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": gin.H{
			"status":   "scanned",
			"nickname": user.Nickname,
			"avatar":   user.Avatar,
		},
	})
}

// ConfirmQR authorizes the web login session
func ConfirmQR(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户 ID"})
		return
	}

	var req QRReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get User info from db
	collection := db.MongoDB.Collection("users")
	var user models.User
	err = collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	redisKey := "qr:login:" + req.UUID
	stateBytes, err := db.RedisClient.Get(ctx, redisKey).Result()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "二维码已失效"})
		return
	}

	var state QRState
	if err := json.Unmarshal([]byte(stateBytes), &state); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "反序列化失败"})
		return
	}

	if state.Status != "scanned" && state.Status != "unused" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "二维码状态不正确"})
		return
	}

	// Generate Web token
	token, err := middleware.GenerateToken(user.ID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成会话 Token 失败"})
		return
	}

	state.Status = "confirmed"
	state.Token = token
	state.User = &models.UserResponse{
		ID:                 user.ID.Hex(),
		Username:           user.Username,
		Nickname:           user.Nickname,
		Avatar:             user.Avatar,
		CustomTransferPath: user.CustomTransferPath,
		Role:               user.Role,
		CreatedAt:          user.CreatedAt,
	}

	newStateBytes, err := json.Marshal(state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化失败"})
		return
	}

	// Keep for 15 seconds to let web client parse/read it
	db.RedisClient.Set(ctx, redisKey, newStateBytes, 15*time.Second)

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": gin.H{
			"status": "success",
		},
	})
}
