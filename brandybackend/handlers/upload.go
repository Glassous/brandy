package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"brandybackend/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/tencentyun/cos-go-sdk-v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func UploadAvatar(c *gin.Context) {
	// 1. Get user ID from middleware Context
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// 2. Retrieve environment variables
	secretID := os.Getenv("COS_SECRET_ID")
	secretKey := os.Getenv("COS_SECRET_KEY")
	bucket := os.Getenv("COS_BUCKET")
	region := os.Getenv("COS_REGION")
	customDomain := os.Getenv("COS_CUSTOM_DOMAIN")

	if secretID == "" || secretKey == "" || bucket == "" || region == "" || customDomain == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Storage configuration incomplete (COS credentials or custom domain missing)"})
		return
	}

	// 3. Get file from form
	file, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to retrieve avatar file"})
		return
	}

	// 4. Validate file size and extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".gif" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file format. Only JPG, PNG, WEBP, and GIF are allowed."})
		return
	}

	srcFile, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open file"})
		return
	}
	defer srcFile.Close()

	// 5. Initialize COS client
	rawURL := fmt.Sprintf("https://%s.cos.%s.myqcloud.com", bucket, region)
	u, err := url.Parse(rawURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse COS service URL"})
		return
	}
	b := &cos.BaseURL{BucketURL: u}
	client := cos.NewClient(b, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})

	// 6. Define unique filename under "avatars/"
	filename := fmt.Sprintf("avatars/%s%s", uuid.New().String(), ext)

	// 7. Upload to COS
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = client.Object.Put(ctx, filename, srcFile, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload to Tencent Cloud COS: " + err.Error()})
		return
	}

	// 8. Generate URL using custom domain
	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	avatarURL := fmt.Sprintf("%s/%s", domain, filename)

	// 9. Update User in DB
	collection := db.MongoDB.Collection("users")
	dbCtx, dbCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer dbCancel()

	_, err = collection.UpdateOne(dbCtx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"avatar": avatarURL}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user avatar in database"})
		return
	}

	// 10. Return avatar URL
	c.JSON(http.StatusOK, gin.H{
		"message": "Avatar uploaded successfully",
		"avatar":  avatarURL,
	})
}
