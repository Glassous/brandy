package db

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/go-redis/redis/v8"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	MongoClient *mongo.Client
	MongoDB     *mongo.Database
	RedisClient *redis.Client
)

func InitDB() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Get MongoDB Configuration
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "brandy"
	}

	// Connect to MongoDB
	var err error
	MongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	// Ping MongoDB
	err = MongoClient.Ping(ctx, nil)
	if err != nil {
		log.Fatalf("Failed to ping MongoDB: %v", err)
	}

	MongoDB = MongoClient.Database(dbName)
	log.Printf("Successfully connected to MongoDB: %s", dbName)

	// 2. Get Redis Configuration
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	redisPassword := os.Getenv("REDIS_PASSWORD")

	RedisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPassword,
		DB:       0,
	})

	// Ping Redis
	_, err = RedisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis at %s: %v", redisAddr, err)
	}

	log.Printf("Successfully connected to Redis: %s", redisAddr)
}
