package handlers

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	sts "github.com/tencentyun/qcloud-cos-sts-sdk/go"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ChatUploadCredentialReq struct {
	Filename string `json:"filename" binding:"required"`
	Size     int64  `json:"size" binding:"required"`
}

func GetChatUploadCredential(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req ChatUploadCredentialReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Simple limit of 100MB per file in chat
	if req.Size > 100*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "聊天文件大小不能超过 100MB"})
		return
	}

	// Generate unique cosKey under "chat" namespace
	ext := ""
	if idx := strings.LastIndex(req.Filename, "."); idx != -1 {
		ext = strings.ToLower(req.Filename[idx:])
	}
	uuidStr := uuid.New().String()
	cosKey := fmt.Sprintf("chat/%s/%s%s", userID.Hex(), uuidStr, ext)

	// Get COS settings
	secretID := os.Getenv("COS_SECRET_ID")
	secretKey := os.Getenv("COS_SECRET_KEY")
	bucket := os.Getenv("COS_BUCKET")
	region := os.Getenv("COS_REGION")
	customDomain := os.Getenv("COS_CUSTOM_DOMAIN")

	if secretID == "" || secretKey == "" || bucket == "" || region == "" || customDomain == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Storage configuration incomplete"})
		return
	}

	appid := getAppIDFromBucket(bucket)
	if appid == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse AppID from bucket name"})
		return
	}

	// STS client
	stsClient := sts.NewClient(secretID, secretKey, nil)
	resourceArn := fmt.Sprintf("qcs::cos:%s:uid/%s:%s/%s", region, appid, bucket, cosKey)

	opt := &sts.CredentialOptions{
		DurationSeconds: int64(30 * time.Minute.Seconds()),
		Region:          region,
		Policy: &sts.CredentialPolicy{
			Statement: []sts.CredentialPolicyStatement{
				{
					Action: []string{
						"name/cos:PutObject",
						"name/cos:PostObject",
						"name/cos:InitiateMultipartUpload",
						"name/cos:ListMultipartUploads",
						"name/cos:ListParts",
						"name/cos:UploadPart",
						"name/cos:CompleteMultipartUpload",
						"name/cos:AbortMultipartUpload",
					},
					Effect:   "allow",
					Resource: []string{resourceArn},
				},
			},
		},
	}

	res, err := stsClient.GetCredential(opt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate upload credentials: " + err.Error()})
		return
	}

	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	fileURL := fmt.Sprintf("%s/%s", domain, cosKey)

	c.JSON(http.StatusOK, gin.H{
		"credentials": gin.H{
			"tmpSecretId":  res.Credentials.TmpSecretID,
			"tmpSecretKey": res.Credentials.TmpSecretKey,
			"sessionToken": res.Credentials.SessionToken,
		},
		"startTime":   res.StartTime,
		"expiredTime": res.ExpiredTime,
		"bucket":      bucket,
		"region":      region,
		"cosKey":      cosKey,
		"url":         fileURL,
	})
}
