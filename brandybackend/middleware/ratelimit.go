package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"brandybackend/db"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

type RateLimitConfig struct {
	MaxRequests int
	Window      time.Duration
}

var (
	DefaultRateLimit = RateLimitConfig{
		MaxRequests: 200,
		Window:      time.Minute,
	}
	AuthRateLimit = RateLimitConfig{
		MaxRequests: 10,
		Window:      time.Minute,
	}
	UploadRateLimit = RateLimitConfig{
		MaxRequests: 20,
		Window:      time.Minute,
	}
)

func RateLimitMiddleware(config RateLimitConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		if isWhitelistedRoute(c) {
			c.Next()
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		key := getRateLimitKey(c)

		allowed, err := checkRateLimit(ctx, db.RedisClient, key, config)
		if err != nil {
			c.Next()
			return
		}

		if !allowed {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":   "请求过于频繁，请稍后再试",
				"retry_after": int(config.Window.Seconds()),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

func isWhitelistedRoute(c *gin.Context) bool {
	path := c.Request.URL.Path
	method := c.Request.Method
	if method != "GET" {
		return false
	}
	if strings.HasPrefix(path, "/api/chats/") && strings.HasSuffix(path, "/messages") {
		return true
	}
	if strings.HasPrefix(path, "/api/groups/") && strings.HasSuffix(path, "/messages") {
		return true
	}
	if path == "/api/auth/qr/status" {
		return true
	}
	return false
}

func getRateLimitKey(c *gin.Context) string {
	if userID, exists := c.Get("userID"); exists {
		return fmt.Sprintf("rate_limit:user:%s", userID)
	}
	clientIP := c.ClientIP()
	return fmt.Sprintf("rate_limit:ip:%s", clientIP)
}

func checkRateLimit(ctx context.Context, client *redis.Client, key string, config RateLimitConfig) (bool, error) {
	now := time.Now()
	windowStart := now.Add(-config.Window)

	pipe := client.Pipeline()

	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart.UnixNano()))

	pipe.ZAdd(ctx, key, &redis.Z{
		Score:  float64(now.UnixNano()),
		Member: fmt.Sprintf("%d", now.UnixNano()),
	})

	countCmd := pipe.ZCard(ctx, key)

	pipe.Expire(ctx, key, config.Window)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	count := countCmd.Val()
	return count <= int64(config.MaxRequests), nil
}
