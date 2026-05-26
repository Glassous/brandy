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
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const DiskLimit = 200 * 1024 * 1024 // 200MB in bytes

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

// Helper to calculate used space
func calculateUsedSpace(ctx context.Context, userID primitive.ObjectID) (int64, error) {
	collection := db.MongoDB.Collection("disk_items")
	filter := bson.M{"user_id": userID, "type": "file"}
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

// 1. 获取当前目录下文件与文件夹列表
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"user_id":   userID,
		"parent_id": parentFilter,
	}

	// Sort: folders first, then files, then sort by name/created_at
	opts := options.Find().SetSort(bson.D{
		{Key: "type", Value: -1}, // "folder" is lexicographically greater than "file" ? Wait, "folder" vs "file": f-o vs f-i. Folder comes first if descending? "folder" > "file". Yes, descending: folder (o) first, file (i) second.
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

// 3. 创建文件夹
type CreateFolderReq struct {
	Name     string `json:"name" binding:"required"`
	ParentID string `json:"parent_id"`
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if same name folder exists in the same parent directory
	collection := db.MongoDB.Collection("disk_items")
	err := collection.FindOne(ctx, bson.M{
		"user_id":   userID,
		"parent_id": parentFilter,
		"name":      req.Name,
		"type":      "folder",
	}).Err()
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

// 4. 上传文件与限额校验
func UploadDiskFile(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	parentIDStr := c.PostForm("parent_id")
	var parentFilter *primitive.ObjectID
	if parentIDStr != "" && parentIDStr != "root" {
		pid, err := primitive.ObjectIDFromHex(parentIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid parent_id"})
			return
		}
		parentFilter = &pid
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Validate user's space usage
	usedSpace, err := calculateUsedSpace(ctx, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify usage space"})
		return
	}

	if usedSpace+file.Size > DiskLimit {
		c.JSON(http.StatusBadRequest, gin.H{"error": "云盘空间不足（限额 200MB）"})
		return
	}

	// Prepare COS Client
	client, _, _, customDomain, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "COS configuration error: " + err.Error()})
		return
	}

	srcFile, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open uploaded file"})
		return
	}
	defer srcFile.Close()

	ext := strings.ToLower(filepath.Ext(file.Filename))
	uuidStr := uuid.New().String()
	cosKey := fmt.Sprintf("disk/%s/%s%s", userID.Hex(), uuidStr, ext)

	_, err = client.Object.Put(ctx, cosKey, srcFile, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload to Tencent Cloud COS: " + err.Error()})
		return
	}

	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	fileURL := fmt.Sprintf("%s/%s", domain, cosKey)

	newItem := models.DiskItem{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		ParentID:  parentFilter,
		Name:      file.Filename,
		Type:      "file",
		Size:      file.Size,
		CosKey:    cosKey,
		URL:       fileURL,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
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

	// Verify ownership
	var item models.DiskItem
	err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	// Check for duplicate name in the same parent directory
	err = collection.FindOne(ctx, bson.M{
		"user_id":   userID,
		"parent_id": item.ParentID,
		"name":      req.Name,
		"type":      item.Type,
		"_id":       bson.M{"$ne": itemID},
	}).Err()
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

// 6. 删除文件或文件夹 (含级联删除逻辑)
func DeleteDiskItem(c *gin.Context) {
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
	err = collection.FindOne(ctx, bson.M{"_id": itemID, "user_id": userID}).Decode(&item)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
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
		// Delete from COS
		if item.CosKey != "" {
			_, _ = client.Object.Delete(ctx, item.CosKey)
		}
		// Delete from MongoDB
		_, err = collection.DeleteOne(ctx, bson.M{"_id": itemID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Delete failed"})
			return
		}
	} else {
		// Recursive folder deletion
		err = deleteFolderRecursively(ctx, client, userID, itemID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder content recursively"})
			return
		}
		// Delete the folder itself
		_, err = collection.DeleteOne(ctx, bson.M{"_id": itemID})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder document"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item deleted successfully"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "您的云盘空间不足（转存文件大小超过限额，限额200MB）"})
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
