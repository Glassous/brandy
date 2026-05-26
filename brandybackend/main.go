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

	// Public Routes
	auth := r.Group("/api/auth")
	{
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.GET("/question", handlers.GetSecurityQuestion)
		auth.POST("/reset-password", handlers.ResetPassword)
	}

	// Protected Routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	{
		// User profile
		api.GET("/user/profile", handlers.GetProfile)
		api.PUT("/user/profile", handlers.UpdateProfile)
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
