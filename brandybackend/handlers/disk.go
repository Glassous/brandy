package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/tencentyun/cos-go-sdk-v5"
	sts "github.com/tencentyun/qcloud-cos-sts-sdk/go"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const DiskLimit = 500 * 1024 * 1024 // 500MB in bytes

// Helper to get COS Client
func getCOSClient() (*cos.Client, string, string, string, error) {
	secretID := os.Getenv("COS_SECRET_ID")
	secretKey := os.Getenv("COS_SECRET_KEY")
	bucket := os.Getenv("COS_BUCKET")
	region := os.Getenv("COS_REGION")
	customDomain := os.Getenv("COS_CUSTOM_DOMAIN")

	if secretID == "" || secretKey == "" || bucket == "" || region == "" || customDomain == "" {
		return nil, "", "", "", fmt.Errorf("storage configuration incomplete")
	}

	rawURL := fmt.Sprintf("https://%s.cos.%s.myqcloud.com", bucket, region)
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, "", "", "", err
	}
	b := &cos.BaseURL{BucketURL: u}
	client := cos.NewClient(b, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})
	return client, bucket, region, customDomain, nil
}

func getAppIDFromBucket(bucket string) string {
	parts := strings.Split(bucket, "-")
	if len(parts) > 1 {
		return parts[len(parts)-1]
	}
	return ""
}

// Helper to calculate used space
func calculateUsedSpace(ctx context.Context, userID primitive.ObjectID) (int64, error) {
	collection := db.MongoDB.Collection("disk_items")
	filter := bson.M{"user_id": userID, "type": "file", "is_deleted": bson.M{"$ne": true}}
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)

	var totalSize int64 = 0
	for cursor.Next(ctx) {
		var item models.DiskItem
		if err := cursor.Decode(&item); err == nil {
			totalSize += item.Size
		}
	}
	return totalSize, nil
}

// 1. 获取当前目录下文件与文件夹列表 (支持 group_id 及 category 分类检索)
func GetDiskItems(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	parentIDStr := c.Query("parent_id")
	var parentFilter interface{}
	if parentIDStr == "" || parentIDStr == "root" {
		parentFilter = nil
	} else {
		pid, err := primitive.ObjectIDFromHex(parentIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent_id"})
			return
		}
		parentFilter = pid
	}

	groupIDStr := c.Query("group_id")
	var groupIDFilter *primitive.ObjectID
	if groupIDStr != "" {
		gid, err := primitive.ObjectIDFromHex(groupIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group_id"})
			return
		}
		// Verify membership
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": gid, "members": userID}).Decode(&group)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
			return
		}
		groupIDFilter = &gid
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"is_deleted": bson.M{"$ne": true},
	}

	if groupIDFilter != nil {
		filter["group_id"] = *groupIDFilter
	} else {
		filter["user_id"] = userID
		filter["group_id"] = nil
	}

	category := c.Query("category")
	if category != "" {
		filter["type"] = "file"
		var regex string
		switch category {
		case "image":
			regex = `\.(jpg|jpeg|png|gif|webp|svg)$`
		case "video":
			regex = `\.(mp4|mkv|avi|mov|wmv)$`
		case "audio":
			regex = `\.(mp3|wav|flac|ogg|wma)$`
		case "document":
			regex = `\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|html)$`
		default:
			regex = `\.(?!(jpg|jpeg|png|gif|webp|svg|mp4|mkv|avi|mov|wmv|mp3|wav|flac|ogg|wma|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|html)$)[a-zA-Z0-9]+$`
		}
		filter["name"] = bson.M{"$regex": regex, "$options": "i"}
	} else {
		filter["parent_id"] = parentFilter
	}

	// Sort: folders first, then files, then sort by name/created_at
	opts := options.Find().SetSort(bson.D{
		{Key: "type", Value: -1},
		{Key: "created_at", Value: -1},
	})

	cursor, err := db.MongoDB.Collection("disk_items").Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer cursor.Close(ctx)

	var items []models.DiskItem = make([]models.DiskItem, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Decode failed"})
		return
	}

	c.JSON(http.StatusOK, items)
}

// 2. 获取当前用户已用空间与限额
func GetDiskUsage(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	used, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate usage"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"used_space":  used,
		"limit_space": DiskLimit,
	})
}

// 3. 创建文件夹 (支持 group_id)
type CreateFolderReq struct {
	Name     string `json:"name" binding:"required"`
	ParentID string `json:"parent_id"`
	GroupID  string `json:"group_id"`
}

func CreateFolder(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req CreateFolderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var parentFilter interface{}
	if req.ParentID == "" || req.ParentID == "root" {
		parentFilter = nil
	} else {
		pid, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent_id"})
			return
		}
		parentFilter = pid
	}

	var groupIDFilter *primitive.ObjectID
	if req.GroupID != "" {
		gid, err := primitive.ObjectIDFromHex(req.GroupID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group_id"})
			return
		}
		// Verify membership
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": gid, "members": userID}).Decode(&group)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
			return
		}
		groupIDFilter = &gid
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if same name folder exists in the same parent directory in this scope
	collection := db.MongoDB.Collection("disk_items")
	dupFilter := bson.M{
		"parent_id": parentFilter,
		"name":      req.Name,
		"type":      "folder",
	}
	if groupIDFilter != nil {
		dupFilter["group_id"] = *groupIDFilter
	} else {
		dupFilter["user_id"] = userID
		dupFilter["group_id"] = nil
	}

	err := collection.FindOne(ctx, dupFilter).Err()
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "同名文件夹已存在"})
		return
	}

	newFolder := models.DiskItem{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		Name:      req.Name,
		Type:      "folder",
		Size:      0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		GroupID:   groupIDFilter,
	}

	if parentFilter != nil {
		pid := parentFilter.(primitive.ObjectID)
		newFolder.ParentID = &pid
	}

	_, err = collection.InsertOne(ctx, newFolder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusOK, newFolder)
}

// 4. 获取上传临时凭据 (支持 group_id)
type UploadCredentialReq struct {
	Filename string `json:"filename" binding:"required"`
	Size     int64  `json:"size" binding:"required"`
	ParentID string `json:"parent_id"`
	GroupID  string `json:"group_id"`
}

func GetUploadCredential(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req UploadCredentialReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var groupIDFilter *primitive.ObjectID
	if req.GroupID != "" {
		gid, err := primitive.ObjectIDFromHex(req.GroupID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group_id"})
			return
		}
		// Verify membership
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": gid, "members": userID}).Decode(&group)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
			return
		}
		groupIDFilter = &gid
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Verify user capacity (for both personal and group uploads, verify against uploader capacity)
	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify usage space"})
		return
	}

	if usedSpace+req.Size > DiskLimit {
		c.JSON(http.StatusBadRequest, gin.H{"error": "云盘空间不足（限额 500MB）"})
		return
	}

	// 2. Generate unique cosKey
	ext := strings.ToLower(filepath.Ext(req.Filename))
	uuidStr := uuid.New().String()
	var cosKey string
	if groupIDFilter != nil {
		cosKey = fmt.Sprintf("disk/group/%s/%s%s", groupIDFilter.Hex(), uuidStr, ext)
	} else {
		cosKey = fmt.Sprintf("disk/%s/%s%s", userID.Hex(), uuidStr, ext)
	}

	// 3. Get COS config
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

	// 4. Initialize STS client
	stsClient := sts.NewClient(secretID, secretKey, nil)

	// 5. Define Credential Policy
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

	// 6. Request credential
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

// 4b. 确认文件直传完成并校验元数据 (支持 group_id)
type UploadCompleteReq struct {
	Filename string `json:"filename" binding:"required"`
	Size     int64  `json:"size" binding:"required"`
	ParentID string `json:"parent_id"`
	CosKey   string `json:"cos_key" binding:"required"`
	URL      string `json:"url" binding:"required"`
	GroupID  string `json:"group_id"`
}

func CompleteUploadDiskFile(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req UploadCompleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var groupIDFilter *primitive.ObjectID
	if req.GroupID != "" {
		gid, err := primitive.ObjectIDFromHex(req.GroupID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group_id"})
			return
		}
		// Verify membership
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": gid, "members": userID}).Decode(&group)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
			return
		}
		groupIDFilter = &gid
	}

	// 1. Verify cosKey prefix
	var expectedPrefix string
	if groupIDFilter != nil {
		expectedPrefix = fmt.Sprintf("disk/group/%s/", groupIDFilter.Hex())
	} else {
		expectedPrefix = fmt.Sprintf("disk/%s/", userID.Hex())
	}
	if !strings.HasPrefix(req.CosKey, expectedPrefix) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid COS Key path"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 2. Fetch the object metadata from COS
	client, _, _, _, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	resp, err := client.Object.Head(ctx, req.CosKey, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File does not exist on COS: " + err.Error()})
		return
	}

	actualSize := resp.ContentLength
	if actualSize == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Uploaded file is empty"})
		return
	}

	// 3. Double-check user capacity
	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify usage space"})
		return
	}

	if usedSpace+actualSize > DiskLimit {
		_, _ = client.Object.Delete(ctx, req.CosKey)
		c.JSON(http.StatusBadRequest, gin.H{"error": "云盘空间不足（限额 500MB）"})
		return
	}

	// 4. Save metadata in MongoDB
	var parentFilter *primitive.ObjectID
	if req.ParentID != "" && req.ParentID != "root" {
		pid, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent_id"})
			return
		}
		parentFilter = &pid
	}

	newItem := models.DiskItem{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		ParentID:  parentFilter,
		Name:      req.Filename,
		Type:      "file",
		Size:      actualSize,
		CosKey:    req.CosKey,
		URL:       req.URL,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		GroupID:   groupIDFilter,
	}

	_, err = db.MongoDB.Collection("disk_items").InsertOne(ctx, newItem)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file metadata"})
		return
	}

	c.JSON(http.StatusOK, newItem)
}

// 5. 重命名文件或文件夹
type RenameReq struct {
	Name string `json:"name" binding:"required"`
}

func RenameDiskItem(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	itemIDStr := c.Param("id")
	itemID, err := primitive.ObjectIDFromHex(itemIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	var req RenameReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	// Get item
	var item models.DiskItem
	err = collection.FindOne(ctx, bson.M{"_id": itemID}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	// Verify permission: owner, or if group item, owner/admin of that group
	isAuthorized := item.UserID == userID
	if !isAuthorized && item.GroupID != nil {
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": *item.GroupID}).Decode(&group)
		if err == nil {
			if group.OwnerID == userID {
				isAuthorized = true
			} else {
				for _, adminID := range group.Admins {
					if adminID == userID {
						isAuthorized = true
						break
					}
				}
			}
		}
	}

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to modify this item"})
		return
	}

	// Check for duplicate name in the same parent directory and scope
	dupFilter := bson.M{
		"parent_id": item.ParentID,
		"name":      req.Name,
		"type":      item.Type,
		"_id":       bson.M{"$ne": itemID},
	}
	if item.GroupID != nil {
		dupFilter["group_id"] = *item.GroupID
	} else {
		dupFilter["user_id"] = userID
		dupFilter["group_id"] = nil
	}

	err = collection.FindOne(ctx, dupFilter).Err()
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "同名文件或文件夹在此目录下已存在"})
		return
	}

	_, err = collection.UpdateOne(ctx, bson.M{"_id": itemID}, bson.M{
		"$set": bson.M{
			"name":       req.Name,
			"updated_at": time.Now(),
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Rename failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Rename successful"})
}

// 6. 删除文件或文件夹 (软删除到回收站)
func DeleteDiskItem(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	itemIDStr := c.Param("id")
	itemID, err := primitive.ObjectIDFromHex(itemIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	// Get item
	var item models.DiskItem
	err = collection.FindOne(ctx, bson.M{"_id": itemID}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	// Verify permission: owner, or if group item, owner/admin of that group
	isAuthorized := item.UserID == userID
	if !isAuthorized && item.GroupID != nil {
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": *item.GroupID}).Decode(&group)
		if err == nil {
			if group.OwnerID == userID {
				isAuthorized = true
			} else {
				for _, adminID := range group.Admins {
					if adminID == userID {
						isAuthorized = true
						break
					}
				}
			}
		}
	}

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this item"})
		return
	}

	now := time.Now()
	_, err = collection.UpdateOne(ctx, bson.M{"_id": itemID}, bson.M{
		"$set": bson.M{
			"is_deleted":       true,
			"directly_deleted": true,
			"deleted_at":       now,
			"updated_at":       now,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to soft delete item"})
		return
	}

	if item.Type == "folder" {
		err = softDeleteFolderRecursively(ctx, userID, itemID, now)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to soft delete folder content recursively"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item moved to recycle bin successfully"})
}

func softDeleteFolderRecursively(ctx context.Context, userID primitive.ObjectID, folderID primitive.ObjectID, t time.Time) error {
	collection := db.MongoDB.Collection("disk_items")
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "parent_id": folderID})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var child models.DiskItem
		if err := cursor.Decode(&child); err != nil {
			continue
		}

		_, _ = collection.UpdateOne(ctx, bson.M{"_id": child.ID}, bson.M{
			"$set": bson.M{
				"is_deleted":       true,
				"directly_deleted": false,
				"deleted_at":       t,
				"updated_at":       t,
			},
		})

		if child.Type == "folder" {
			_ = softDeleteFolderRecursively(ctx, userID, child.ID, t)
		}
	}
	return nil
}

func deleteFolderRecursively(ctx context.Context, client *cos.Client, userID primitive.ObjectID, folderID primitive.ObjectID) error {
	collection := db.MongoDB.Collection("disk_items")
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "parent_id": folderID})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var child models.DiskItem
		if err := cursor.Decode(&child); err != nil {
			continue
		}

		if child.Type == "file" {
			// Delete file from COS and DB
			if child.CosKey != "" {
				_, _ = client.Object.Delete(ctx, child.CosKey)
			}
			_, _ = collection.DeleteOne(ctx, bson.M{"_id": child.ID})
		} else {
			// Delete folder recursively
			_ = deleteFolderRecursively(ctx, client, userID, child.ID)
			_, _ = collection.DeleteOne(ctx, bson.M{"_id": child.ID})
		}
	}
	return nil
}

// 7. 获取文件夹的面包屑路径 (Breadcrumbs)
func GetFolderPath(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	folderIDStr := c.Param("id")
	folderID, err := primitive.ObjectIDFromHex(folderIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")
	var path []gin.H = make([]gin.H, 0)

	currentID := &folderID
	for currentID != nil {
		var item models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": *currentID, "user_id": userID, "type": "folder"}).Decode(&item)
		if err != nil {
			break
		}

		path = append([]gin.H{{"id": item.ID.Hex(), "name": item.Name}}, path...)
		currentID = item.ParentID
	}

	c.JSON(http.StatusOK, path)
}

// 8. 分享给好友 (以卡片消息发送)
type ShareReq struct {
	FileID   string `json:"file_id" binding:"required"`
	FriendID string `json:"friend_id" binding:"required"`
}

func ShareToFriend(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req ShareReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	friendID, err := primitive.ObjectIDFromHex(req.FriendID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid friend ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify friendship
	var existingFriend models.Friend
	err = db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": userID, "friend_id": friendID}).Decode(&existingFriend)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not friends with this user"})
		return
	}

	// Verify file existence
	var fileItem models.DiskItem
	err = db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{"_id": func() primitive.ObjectID {
		oid, _ := primitive.ObjectIDFromHex(req.FileID)
		return oid
	}(), "user_id": userID, "type": "file"}).Decode(&fileItem)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found or has been deleted"})
		return
	}

	// Construct struct content for file sharing card
	sharePayload := gin.H{
		"type":      "file_share",
		"file_id":   fileItem.ID.Hex(),
		"file_name": fileItem.Name,
		"file_size": fileItem.Size,
		"url":       fileItem.URL,
	}

	payloadBytes, err := json.Marshal(sharePayload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create share payload"})
		return
	}

	// Create and insert chat message
	msg := models.Message{
		ID:         primitive.NewObjectID(),
		SenderID:   userID,
		ReceiverID: friendID,
		Content:    string(payloadBytes),
		IsRead:     false,
		CreatedAt:  time.Now(),
	}

	_, err = db.MongoDB.Collection("messages").InsertOne(ctx, msg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	// Broadcast via Redis / WS
	eventData := MessageEventData{
		ID:         msg.ID.Hex(),
		SenderID:   userIDStr,
		ReceiverID: req.FriendID,
		Content:    msg.Content,
		CreatedAt:  msg.CreatedAt,
	}

	wsMsg := WSMessage{
		Event: "message",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	// Publish to Redis channel for receiver and sender
	db.RedisClient.Publish(context.Background(), "user_messages:"+req.FriendID, wsMsgBytes)
	db.RedisClient.Publish(context.Background(), "user_messages:"+userIDStr, wsMsgBytes)

	c.JSON(http.StatusOK, gin.H{"message": "Shared successfully"})
}

// 9. 检查分享转存状态
func CheckTransferStatus(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	originIDStr := c.Param("origin_id")
	originID, err := primitive.ObjectIDFromHex(originIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid origin ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existing models.DiskItem
	err = db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{
		"user_id":        userID,
		"origin_item_id": originID,
	}).Decode(&existing)

	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusOK, gin.H{"transferred": false})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"transferred": true})
}

// 10. 转存文件 (物理复制及额度校验)
type TransferReq struct {
	FileID   string `json:"file_id" binding:"required"`
	ParentID string `json:"parent_id"` // Optional target folder
}

func TransferDiskFile(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req TransferReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	originID, err := primitive.ObjectIDFromHex(req.FileID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file ID"})
		return
	}

	var parentFilter *primitive.ObjectID
	if req.ParentID != "" && req.ParentID != "root" {
		pid, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent_id"})
			return
		}
		parentFilter = &pid
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 1. Fetch original file (can be owned by anyone since it is shared)
	var originItem models.DiskItem
	err = db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{"_id": originID, "type": "file"}).Decode(&originItem)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusBadRequest, gin.H{"error": "原文件不存在或已被原作者删除"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch original file details"})
		return
	}

	// 2. Validate current user's space usage
	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify usage space"})
		return
	}

	if usedSpace+originItem.Size > DiskLimit {
		c.JSON(http.StatusBadRequest, gin.H{"error": "您的云盘空间不足（转存文件大小超过限额，限额 500MB）"})
		return
	}

	// 3. Check if user already transferred it to the same parent directory to avoid duplicates
	var duplicate models.DiskItem
	err = db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{
		"user_id":        userID,
		"parent_id":      parentFilter,
		"origin_item_id": originItem.ID,
	}).Decode(&duplicate)
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "您在此文件夹下已经转存过此文件"})
		return
	}

	// 4. Perform COS Object Copy
	client, bucket, region, customDomain, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	ext := strings.ToLower(filepath.Ext(originItem.Name))
	uuidStr := uuid.New().String()
	destKey := fmt.Sprintf("disk/%s/%s%s", userID.Hex(), uuidStr, ext)

	// Format Source URL: <bucket>.cos.<region>.myqcloud.com/<source-key>
	sourceURL := fmt.Sprintf("%s.cos.%s.myqcloud.com/%s", bucket, region, originItem.CosKey)

	_, _, err = client.Object.Copy(ctx, destKey, sourceURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Tencent COS Copy failed: " + err.Error()})
		return
	}

	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	fileURL := fmt.Sprintf("%s/%s", domain, destKey)

	// 5. Create new DiskItem record
	newItem := models.DiskItem{
		ID:           primitive.NewObjectID(),
		UserID:       userID,
		ParentID:     parentFilter,
		OriginItemID: &originItem.ID,
		Name:         originItem.Name,
		Type:         "file",
		Size:         originItem.Size,
		CosKey:       destKey,
		URL:          fileURL,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	_, err = db.MongoDB.Collection("disk_items").InsertOne(ctx, newItem)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save transferred file metadata"})
		return
	}

	c.JSON(http.StatusOK, newItem)
}

// Helper to get or recursively create a folder path and return its ID
func getOrCreateFolderByPath(ctx context.Context, userID primitive.ObjectID, pathStr string) (*primitive.ObjectID, error) {
	pathStr = strings.TrimSpace(pathStr)
	if pathStr == "" {
		return nil, nil
	}

	parts := strings.Split(pathStr, "/")
	var currentParent *primitive.ObjectID = nil
	collection := db.MongoDB.Collection("disk_items")

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		filter := bson.M{
			"user_id":   userID,
			"name":      part,
			"type":      "folder",
		}
		if currentParent == nil {
			filter["parent_id"] = nil
		} else {
			filter["parent_id"] = *currentParent
		}

		var existingFolder models.DiskItem
		err := collection.FindOne(ctx, filter).Decode(&existingFolder)
		if err == mongo.ErrNoDocuments {
			// Create it
			newFolder := models.DiskItem{
				ID:        primitive.NewObjectID(),
				UserID:    userID,
				ParentID:  currentParent,
				Name:      part,
				Type:      "folder",
				Size:      0,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			_, err = collection.InsertOne(ctx, newFolder)
			if err != nil {
				return nil, err
			}
			currentParent = &newFolder.ID
		} else if err != nil {
			return nil, err
		} else {
			currentParent = &existingFolder.ID
		}
	}

	return currentParent, nil
}

type SaveChatFileReq struct {
	Filename string `json:"filename" binding:"required"`
	Size     int64  `json:"size" binding:"required"`
	CosKey   string `json:"cos_key" binding:"required"`
}

func SaveChatFileToDisk(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req SaveChatFileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Verify cosKey starts with "chat/" to prevent directory traversal
	if !strings.HasPrefix(req.CosKey, "chat/") {
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid COS Key path"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 2. Validate current user's space usage
	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify usage space"})
		return
	}

	if usedSpace+req.Size > DiskLimit {
		c.JSON(http.StatusBadRequest, gin.H{"error": "您的云盘空间不足（限额 500MB）"})
		return
	}

	// 3. Check if user already transferred it to avoid duplicates
	var duplicate models.DiskItem
	err = db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{
		"user_id":        userID,
		"source_cos_key": req.CosKey,
	}).Decode(&duplicate)
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "您已经转存过此文件"})
		return
	}

	// 4. Query user setting for custom transfer path, default is "聊天记录转存"
	var user models.User
	err = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user settings"})
		return
	}

	transferPath := strings.TrimSpace(user.CustomTransferPath)
	if transferPath == "" {
		transferPath = "聊天记录转存"
	}

	// 5. Get or create folder
	parentFolderID, err := getOrCreateFolderByPath(ctx, userID, transferPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transfer folder: " + err.Error()})
		return
	}

	// 6. Perform COS Object Copy
	client, bucket, region, customDomain, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	ext := ""
	if idx := strings.LastIndex(req.Filename, "."); idx != -1 {
		ext = strings.ToLower(req.Filename[idx:])
	}
	uuidStr := uuid.New().String()
	destKey := fmt.Sprintf("disk/%s/%s%s", userID.Hex(), uuidStr, ext)

	// Format Source URL: <bucket>.cos.<region>.myqcloud.com/<source-key>
	sourceURL := fmt.Sprintf("%s.cos.%s.myqcloud.com/%s", bucket, region, req.CosKey)

	_, _, err = client.Object.Copy(ctx, destKey, sourceURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Tencent COS Copy failed: " + err.Error()})
		return
	}

	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	fileURL := fmt.Sprintf("%s/%s", domain, destKey)

	// 7. Create new DiskItem record
	newItem := models.DiskItem{
		ID:           primitive.NewObjectID(),
		UserID:       userID,
		ParentID:     parentFolderID,
		Name:         req.Filename,
		Type:         "file",
		Size:         req.Size,
		CosKey:       destKey,
		SourceCosKey: req.CosKey,
		URL:          fileURL,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	_, err = db.MongoDB.Collection("disk_items").InsertOne(ctx, newItem)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save transferred file metadata"})
		return
	}

	c.JSON(http.StatusOK, newItem)
}

func CheckChatTransferStatus(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	cosKey := c.Query("cos_key")
	if cosKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing cos_key parameter"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existing models.DiskItem
	err := db.MongoDB.Collection("disk_items").FindOne(ctx, bson.M{
		"user_id":        userID,
		"source_cos_key": cosKey,
	}).Decode(&existing)

	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusOK, gin.H{"transferred": false})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"transferred": true})
}

// 11. 获取回收站中的项目
func GetTrashItems(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id":          userID,
		"is_deleted":       true,
		"directly_deleted": true,
	}

	opts := options.Find().SetSort(bson.D{
		{Key: "type", Value: -1},
		{Key: "deleted_at", Value: -1},
	})

	cursor, err := db.MongoDB.Collection("disk_items").Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer cursor.Close(ctx)

	var items []models.DiskItem = make([]models.DiskItem, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Decode failed"})
		return
	}

	c.JSON(http.StatusOK, items)
}

// 12. 还原回收站中的项目
func RestoreTrashItem(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	itemIDStr := c.Param("id")
	itemID, err := primitive.ObjectIDFromHex(itemIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	// Verify ownership
	var item models.DiskItem
	err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID, "is_deleted": true}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found in trash"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	// Restore the item itself
	// If it has a parent, check if the parent itself is still deleted.
	// If parent is deleted, move restored item to root (parent_id = nil) so it doesn't stay hidden!
	var parentFilter *primitive.ObjectID = nil
	if item.ParentID != nil {
		var parent models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": *item.ParentID, "user_id": userID}).Decode(&parent)
		if err == nil && !parent.IsDeleted {
			parentFilter = item.ParentID
		}
	}

	_, err = collection.UpdateOne(ctx, bson.M{"_id": itemID}, bson.M{
		"$set": bson.M{
			"is_deleted":       false,
			"directly_deleted": false,
			"deleted_at":       nil,
			"parent_id":        parentFilter,
			"updated_at":       time.Now(),
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore item"})
		return
	}

	if item.Type == "folder" {
		err = restoreFolderRecursively(ctx, userID, itemID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore folder contents"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item restored successfully"})
}

func restoreFolderRecursively(ctx context.Context, userID primitive.ObjectID, folderID primitive.ObjectID) error {
	collection := db.MongoDB.Collection("disk_items")
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "parent_id": folderID})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var child models.DiskItem
		if err := cursor.Decode(&child); err != nil {
			continue
		}

		_, _ = collection.UpdateOne(ctx, bson.M{"_id": child.ID}, bson.M{
			"$set": bson.M{
				"is_deleted":       false,
				"directly_deleted": false,
				"deleted_at":       nil,
				"updated_at":       time.Now(),
			},
		})

		if child.Type == "folder" {
			_ = restoreFolderRecursively(ctx, userID, child.ID)
		}
	}
	return nil
}

// 13. 彻底删除单个文件或文件夹 (物理删除)
func DeleteTrashItem(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	itemIDStr := c.Param("id")
	itemID, err := primitive.ObjectIDFromHex(itemIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	// Verify ownership
	var item models.DiskItem
	err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID, "is_deleted": true}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found in trash"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	client, _, _, _, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	if item.Type == "file" {
		if item.CosKey != "" {
			_, _ = client.Object.Delete(ctx, item.CosKey)
		}
		_, err = collection.DeleteOne(ctx, bson.M{"_id": itemID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Delete failed"})
			return
		}
	} else {
		err = deleteFolderRecursively(ctx, client, userID, itemID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder contents"})
			return
		}
		_, err = collection.DeleteOne(ctx, bson.M{"_id": itemID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder record"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item deleted permanently"})
}

// 14. 清空回收站
func ClearTrash(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	// Find all directly deleted items in trash
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "is_deleted": true, "directly_deleted": true})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query trash"})
		return
	}
	defer cursor.Close(ctx)

	client, _, _, _, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	for cursor.Next(ctx) {
		var item models.DiskItem
		if err := cursor.Decode(&item); err != nil {
			continue
		}

		if item.Type == "file" {
			if item.CosKey != "" {
				_, _ = client.Object.Delete(ctx, item.CosKey)
			}
			_, _ = collection.DeleteOne(ctx, bson.M{"_id": item.ID})
		} else {
			_ = deleteFolderRecursively(ctx, client, userID, item.ID)
			_, _ = collection.DeleteOne(ctx, bson.M{"_id": item.ID})
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Recycle bin cleared successfully"})
}

// 15. 批量删除 (移入回收站)
type BatchDeleteReq struct {
	ItemIDs []string `json:"item_ids" binding:"required"`
}

func BatchDeleteDiskItems(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req BatchDeleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")
	now := time.Now()

	for _, idStr := range req.ItemIDs {
		itemID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			continue
		}

		var item models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID}).Decode(&item)
		if err != nil {
			continue
		}

		_, err = collection.UpdateOne(ctx, bson.M{"_id": itemID}, bson.M{
			"$set": bson.M{
				"is_deleted":       true,
				"directly_deleted": true,
				"deleted_at":       now,
				"updated_at":       now,
			},
		})
		if err == nil && item.Type == "folder" {
			_ = softDeleteFolderRecursively(ctx, userID, itemID, now)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Batch delete successful"})
}

// 16. 批量移动文件/文件夹
type MoveItemsReq struct {
	ItemIDs        []string `json:"item_ids" binding:"required"`
	TargetParentID string   `json:"target_parent_id"` // can be empty or "root"
}

func MoveDiskItems(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req MoveItemsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	var targetParent *primitive.ObjectID = nil
	if req.TargetParentID != "" && req.TargetParentID != "root" {
		tpid, err := primitive.ObjectIDFromHex(req.TargetParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target_parent_id"})
			return
		}
		// Verify target parent exists and belongs to user
		var parent models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": tpid, "user_id": userID, "type": "folder", "is_deleted": bson.M{"$ne": true}}).Decode(&parent)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target parent directory not found"})
			return
		}
		targetParent = &tpid
	}

	for _, idStr := range req.ItemIDs {
		itemID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			continue
		}

		// Prevent moving a folder into itself or its own subfolder
		if targetParent != nil && itemID == *targetParent {
			continue // skip
		}
		if targetParent != nil && isDescendantOf(ctx, userID, *targetParent, itemID) {
			continue // skip to avoid recursive loop
		}

		_, _ = collection.UpdateOne(ctx, bson.M{"_id": itemID, "user_id": userID}, bson.M{
			"$set": bson.M{
				"parent_id":  targetParent,
				"updated_at": time.Now(),
			},
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Items moved successfully"})
}

// Check if a folder is a descendant of another folder
func isDescendantOf(ctx context.Context, userID primitive.ObjectID, folderID primitive.ObjectID, ancestorID primitive.ObjectID) bool {
	collection := db.MongoDB.Collection("disk_items")
	currID := &folderID
	for currID != nil {
		if *currID == ancestorID {
			return true
		}
		var item models.DiskItem
		err := collection.FindOne(ctx, bson.M{"_id": *currID, "user_id": userID}).Decode(&item)
		if err != nil {
			break
		}
		currID = item.ParentID
	}
	return false
}

// 17. 批量复制文件/文件夹
type CopyItemsReq struct {
	ItemIDs        []string `json:"item_ids" binding:"required"`
	TargetParentID string   `json:"target_parent_id"` // can be empty or "root"
}

func CopyDiskItems(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req CopyItemsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("disk_items")

	var targetParent *primitive.ObjectID = nil
	if req.TargetParentID != "" && req.TargetParentID != "root" {
		tpid, err := primitive.ObjectIDFromHex(req.TargetParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target_parent_id"})
			return
		}
		var parent models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": tpid, "user_id": userID, "type": "folder", "is_deleted": bson.M{"$ne": true}}).Decode(&parent)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target parent directory not found"})
			return
		}
		targetParent = &tpid
	}

	client, bucket, region, _, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	// Keep track of how much size we're copying to check limit
	var totalSizeToCopy int64 = 0
	for _, idStr := range req.ItemIDs {
		itemID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			continue
		}
		var item models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID, "is_deleted": bson.M{"$ne": true}}).Decode(&item)
		if err != nil {
			continue
		}
		if item.Type == "file" {
			totalSizeToCopy += item.Size
		} else {
			totalSizeToCopy += getFolderSize(ctx, userID, item.ID)
		}
	}

	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err == nil {
		if usedSpace+totalSizeToCopy > DiskLimit {
			c.JSON(http.StatusBadRequest, gin.H{"error": "复制失败，超出云盘存储空间限额（500MB）"})
			return
		}
	}

	for _, idStr := range req.ItemIDs {
		itemID, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			continue
		}

		var item models.DiskItem
		err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID, "is_deleted": bson.M{"$ne": true}}).Decode(&item)
		if err != nil {
			continue
		}

		if item.Type == "file" {
			_ = copyFileRecord(ctx, client, bucket, region, userID, item, targetParent)
		} else {
			_ = copyFolderRecordRecursively(ctx, client, bucket, region, userID, item, targetParent)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Items copied successfully"})
}

func getFolderSize(ctx context.Context, userID primitive.ObjectID, folderID primitive.ObjectID) int64 {
	collection := db.MongoDB.Collection("disk_items")
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "parent_id": folderID, "is_deleted": bson.M{"$ne": true}})
	if err != nil {
		return 0
	}
	defer cursor.Close(ctx)

	var total int64 = 0
	for cursor.Next(ctx) {
		var child models.DiskItem
		if err := cursor.Decode(&child); err == nil {
			if child.Type == "file" {
				total += child.Size
			} else {
				total += getFolderSize(ctx, userID, child.ID)
			}
		}
	}
	return total
}

func copyFileRecord(ctx context.Context, client *cos.Client, bucket, region string, userID primitive.ObjectID, fileItem models.DiskItem, targetParent *primitive.ObjectID) error {
	collection := db.MongoDB.Collection("disk_items")

	ext := strings.ToLower(filepath.Ext(fileItem.Name))
	uuidStr := uuid.New().String()
	destKey := fmt.Sprintf("disk/%s/%s%s", userID.Hex(), uuidStr, ext)
	sourceURL := fmt.Sprintf("%s.cos.%s.myqcloud.com/%s", bucket, region, fileItem.CosKey)

	// Copy COS object
	_, _, err := client.Object.Copy(ctx, destKey, sourceURL, nil)
	if err != nil {
		return err
	}

	// Create new record with same URL layout
	newURL := strings.Replace(fileItem.URL, fileItem.CosKey, destKey, 1)

	newItem := models.DiskItem{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		ParentID:  targetParent,
		Name:      fileItem.Name,
		Type:      "file",
		Size:      fileItem.Size,
		CosKey:    destKey,
		URL:       newURL,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err = collection.InsertOne(ctx, newItem)
	return err
}

func copyFolderRecordRecursively(ctx context.Context, client *cos.Client, bucket, region string, userID primitive.ObjectID, folderItem models.DiskItem, targetParent *primitive.ObjectID) error {
	collection := db.MongoDB.Collection("disk_items")

	// Create folder record copy
	newFolder := models.DiskItem{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		ParentID:  targetParent,
		Name:      folderItem.Name,
		Type:      "folder",
		Size:      0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err := collection.InsertOne(ctx, newFolder)
	if err != nil {
		return err
	}

	// Copy children
	cursor, err := collection.Find(ctx, bson.M{"user_id": userID, "parent_id": folderItem.ID, "is_deleted": bson.M{"$ne": true}})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var child models.DiskItem
		if err := cursor.Decode(&child); err == nil {
			if child.Type == "file" {
				_ = copyFileRecord(ctx, client, bucket, region, userID, child, &newFolder.ID)
			} else {
				_ = copyFolderRecordRecursively(ctx, client, bucket, region, userID, child, &newFolder.ID)
			}
		}
	}

	return nil
}
