package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PublishVersionReq defines the schema for publishing a new app version
type PublishVersionReq struct {
	VersionCode             int    `json:"version_code" binding:"required"`
	VersionName             string `json:"version_name" binding:"required"`
	DownloadURL             string `json:"download_url" binding:"required"`
	Description             string `json:"description"`
	ForceUpdate             bool   `json:"force_update"`
	MinSupportedVersionCode int    `json:"min_supported_version_code"`
}

// UploadApk handles uploading APK package to COS by the administrator
func UploadApk(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到上传的文件"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".apk" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持上传 .apk 格式的安装包"})
		return
	}

	// Read config and initialize COS client
	client, _, _, customDomain, err := getCOSClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "对象存储配置不完整: " + err.Error()})
		return
	}

	// Plan COS Key: apk/brandy-<uuid>-<filename>.apk
	fileNameWithoutExt := header.Filename[:len(header.Filename)-len(ext)]
	// Clean filename
	fileNameWithoutExt = strings.ReplaceAll(fileNameWithoutExt, " ", "_")
	cosKey := fmt.Sprintf("apk/brandy-%s-%s%s", uuid.New().String()[:8], fileNameWithoutExt, ext)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second) // Up to 2 mins for large APK upload
	defer cancel()

	// Upload to Tencent COS
	_, err = client.Object.Put(ctx, cosKey, file, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传至对象存储失败: " + err.Error()})
		return
	}

	domain := strings.TrimRight(customDomain, "/")
	if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
		domain = "https://" + domain
	}
	fileURL := fmt.Sprintf("%s/%s", domain, cosKey)

	c.JSON(http.StatusOK, gin.H{
		"url":      fileURL,
		"filename": header.Filename,
	})
}

// PublishAppVersion saves new version info to MongoDB, history folder, and root version.json
func PublishAppVersion(c *gin.Context) {
	var req PublishVersionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	newVersion := models.AppVersion{
		ID:                      primitive.NewObjectID(),
		VersionCode:             req.VersionCode,
		VersionName:             req.VersionName,
		DownloadURL:             req.DownloadURL,
		Description:             req.Description,
		ForceUpdate:             req.ForceUpdate,
		MinSupportedVersionCode: req.MinSupportedVersionCode,
		CreatedAt:               time.Now(),
	}

	// 1. Insert into MongoDB
	collection := db.MongoDB.Collection("app_versions")
	_, err := collection.InsertOne(ctx, newVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存版本信息到数据库失败: " + err.Error()})
		return
	}

	// 2. Ensure history directory exists
	historyDir := "history"
	if err := os.MkdirAll(historyDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建历史版本目录失败: " + err.Error()})
		return
	}

	// 3. Write copy version_{code}.json
	jsonData, err := json.MarshalIndent(newVersion, "", "  ")
	if err == nil {
		historyFilePath := filepath.Join(historyDir, fmt.Sprintf("version_%d.json", req.VersionCode))
		_ = os.WriteFile(historyFilePath, jsonData, 0644)
	}

	// 4. Update root version.json
	_ = os.WriteFile("version.json", jsonData, 0644)

	c.JSON(http.StatusOK, gin.H{
		"message": "版本发布成功",
		"version": newVersion,
	})
}

// GetAppVersion serves the latest active version
func GetAppVersion(c *gin.Context) {
	// First try to read root version.json
	data, err := os.ReadFile("version.json")
	if err == nil {
		var ver models.AppVersion
		if err := json.Unmarshal(data, &ver); err == nil {
			c.JSON(http.StatusOK, ver)
			return
		}
	}

	// Fallback: Query MongoDB for the latest version
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("app_versions")
	opts := options.FindOne().SetSort(bson.D{{Key: "version_code", Value: -1}})
	
	var ver models.AppVersion
	err = collection.FindOne(ctx, bson.M{}, opts).Decode(&ver)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "暂无发布版本"})
		return
	}

	c.JSON(http.StatusOK, ver)
}

// GetVersionHistory lists all past versions
func GetVersionHistory(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("app_versions")
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询版本历史失败"})
		return
	}
	defer cursor.Close(ctx)

	var history []models.AppVersion = make([]models.AppVersion, 0)
	if err := cursor.All(ctx, &history); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析历史版本失败"})
		return
	}

	c.JSON(http.StatusOK, history)
}
