package handlers

import (
	"context"
	"net/http"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// GetStickers retrieves all custom stickers for the current user
func GetStickers(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := db.MongoDB.Collection("stickers").Find(ctx, bson.M{"user_id": userID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stickers"})
		return
	}
	defer cursor.Close(ctx)

	var stickers []models.Sticker = []models.Sticker{}
	if err = cursor.All(ctx, &stickers); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode stickers"})
		return
	}

	c.JSON(http.StatusOK, stickers)
}

// AddSticker adds a new custom sticker for the current user
func AddSticker(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	sticker := models.Sticker{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		URL:       req.URL,
		CreatedAt: time.Now(),
	}

	_, err = db.MongoDB.Collection("stickers").InsertOne(ctx, sticker)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save sticker"})
		return
	}

	c.JSON(http.StatusCreated, sticker)
}

// DeleteSticker removes a custom sticker
func DeleteSticker(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	stickerIDStr := c.Param("id")
	stickerID, err := primitive.ObjectIDFromHex(stickerIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sticker ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure the sticker belongs to the requesting user before deleting
	filter := bson.M{
		"_id":     stickerID,
		"user_id": userID,
	}

	res, err := db.MongoDB.Collection("stickers").DeleteOne(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete sticker"})
		return
	}

	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sticker not found or unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sticker deleted successfully"})
}
