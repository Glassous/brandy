package main

import (
	"log"
	"os"

	"brandybackend/db"
	"brandybackend/handlers"
	"brandybackend/middleware"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func main() {
	// Load environmental variables from .env (ignored if file not present e.g. in Docker production)
	if err := godotenv.Load(); err != nil {
		log.Println("Note: No .env file found, using system environment variables")
	}

	// Initialize database connections
	db.InitDB()

	// Initialize JWT settings
	middleware.InitJWT()

	// Start WebSocket Hub in background
	go handlers.GlobalHub.Start()

	// Setup Gin
	r := gin.Default()
	r.Use(CORSMiddleware())

	// Public Routes with stricter rate limiting for auth endpoints
	auth := r.Group("/api/auth")
	auth.Use(middleware.RateLimitMiddleware(middleware.AuthRateLimit))
	{
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.POST("/send-code", handlers.SendVerificationCode)
		auth.POST("/login-code", handlers.LoginWithCode)
		auth.POST("/reset-password", handlers.ResetPassword)
	}

	// Admin Public Routes
	adminAuth := r.Group("/api/admin/auth")
	adminAuth.Use(middleware.RateLimitMiddleware(middleware.AuthRateLimit))
	{
		adminAuth.POST("/register", handlers.AdminRegister)
		adminAuth.POST("/login", handlers.AdminLogin)
		adminAuth.POST("/login-code", handlers.AdminLoginCode)
	}

	// Admin Protected Routes
	adminAPI := r.Group("/api/admin")
	adminAPI.Use(middleware.AuthMiddleware())
	adminAPI.Use(middleware.AdminMiddleware())
	adminAPI.Use(middleware.RateLimitMiddleware(middleware.DefaultRateLimit))
	{
		adminAPI.GET("/stats", handlers.GetSystemStats)
		adminAPI.GET("/users", handlers.GetAdminUsers)
		adminAPI.PUT("/users/:id", handlers.UpdateAdminUser)
		adminAPI.DELETE("/users/:id", handlers.DeleteAdminUser)
		adminAPI.GET("/groups", handlers.GetAdminGroups)
		adminAPI.DELETE("/groups/:id", handlers.DeleteAdminGroup)
	}

	// Protected Routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	api.Use(middleware.RateLimitMiddleware(middleware.DefaultRateLimit))
	{
		// User profile
		api.GET("/user/profile", handlers.GetProfile)
		api.PUT("/user/profile", handlers.UpdateProfile)
		api.POST("/user/change-password", handlers.ChangePassword)
		api.POST("/user/avatar", handlers.UploadAvatar)
		api.GET("/users/search", handlers.SearchUser)

		// Friend relationship
		api.GET("/friends", handlers.GetFriends)
		api.DELETE("/friends/:id", handlers.DeleteFriend)
		api.POST("/friends/request", handlers.SendFriendRequest)
		api.GET("/friends/requests", handlers.GetFriendRequests)
		api.PUT("/friends/requests/:id", handlers.HandleFriendRequest)
		api.PUT("/friends/:id/remark", handlers.UpdateFriendRemark)

		// Chat historical routes
		api.GET("/chats", handlers.GetChats)
		api.GET("/chats/:friend_id/messages", handlers.GetChatMessages)

		// Group chat routes
		api.POST("/groups", handlers.CreateGroup)
		api.GET("/groups", handlers.GetGroups)
		api.GET("/groups/:group_id", handlers.GetGroupDetail)
		api.PUT("/groups/:group_id", handlers.UpdateGroup)
		api.POST("/groups/:group_id/members", handlers.AddGroupMembers)
		api.DELETE("/groups/:group_id/members/:user_id", handlers.RemoveGroupMember)
		api.POST("/groups/:group_id/admins", handlers.AddGroupAdmin)
		api.DELETE("/groups/:group_id/admins/:user_id", handlers.RemoveGroupAdmin)
		api.GET("/groups/:group_id/messages", handlers.GetGroupMessages)
		api.POST("/groups/:group_id/ai-members", handlers.AddAIMember)
		api.GET("/groups/:group_id/ai-members", handlers.GetAIMembers)
		api.PUT("/groups/:group_id/ai-members/:ai_id", handlers.UpdateAIMember)
		api.DELETE("/groups/:group_id/ai-members/:ai_id", handlers.RemoveAIMember)

		// Cloud Disk Routes
		api.GET("/disk/items", handlers.GetDiskItems)
		api.GET("/disk/usage", handlers.GetDiskUsage)
		api.POST("/disk/folders", handlers.CreateFolder)
		api.POST("/disk/upload-credential", handlers.GetUploadCredential)
		api.POST("/disk/upload-complete", handlers.CompleteUploadDiskFile)
		api.PUT("/disk/items/:id", handlers.RenameDiskItem)
		api.DELETE("/disk/items/:id", handlers.DeleteDiskItem)
		api.GET("/disk/folders/:id/path", handlers.GetFolderPath)
		api.POST("/disk/share/friend", handlers.ShareToFriend)
		api.GET("/disk/check-transfer/:origin_id", handlers.CheckTransferStatus)
		api.POST("/disk/transfer", handlers.TransferDiskFile)
		api.POST("/disk/save-chat-file", handlers.SaveChatFileToDisk)
		api.GET("/disk/check-chat-transfer", handlers.CheckChatTransferStatus)

		// Chat Routes
		api.POST("/chat/upload-credential", handlers.GetChatUploadCredential)
	}

	// WebSocket endpoint
	r.GET("/api/ws", handlers.HandleWS)

	// Get server port from env, default is 8081
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	log.Printf("Server starting on port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to run Gin server: %v", err)
	}
}
