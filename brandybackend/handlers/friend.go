package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type SendFriendRequestReq struct {
	Username string `json:"username" binding:"required"`
}

type HandleFriendRequestReq struct {
	Status string `json:"status" binding:"required,oneof=accepted rejected"`
}

type FriendRequestResponse struct {
	RequestID      string `json:"request_id"`
	SenderID       string `json:"sender_id"`
	SenderUsername string `json:"sender_username"`
	SenderNickname string `json:"sender_nickname"`
	CreatedAt      time.Time `json:"created_at"`
}

func SendFriendRequest(c *gin.Context) {
	var req SendFriendRequestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	senderIDStr := c.GetString("userID")
	senderID, _ := primitive.ObjectIDFromHex(senderIDStr)

	targetUsername := strings.TrimSpace(strings.ToLower(req.Username))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Find target user
	var receiver models.User
	err := db.MongoDB.Collection("users").FindOne(ctx, bson.M{"username": targetUsername}).Decode(&receiver)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if receiver.ID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You cannot add yourself as a friend"})
		return
	}

	// 2. Check if already friends
	var existingFriend models.Friend
	err = db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": senderID, "friend_id": receiver.ID}).Decode(&existingFriend)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You are already friends"})
		return
	}

	// 3. Check existing friend requests
	var incomingRequest models.FriendRequest
	err = db.MongoDB.Collection("friend_requests").FindOne(ctx, bson.M{"sender_id": receiver.ID, "receiver_id": senderID, "status": "pending"}).Decode(&incomingRequest)
	if err == nil {
		// If B has already sent a request to A, and A now tries to add B, accept it automatically!
		err = establishFriendship(ctx, senderID, receiver.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to establish friendship"})
			return
		}
		// Update request status
		db.MongoDB.Collection("friend_requests").UpdateOne(ctx, bson.M{"_id": incomingRequest.ID}, bson.M{"$set": bson.M{"status": "accepted"}})
		c.JSON(http.StatusOK, gin.H{"message": "Friend request automatically accepted, you are now friends!"})
		return
	}

	var outgoingRequest models.FriendRequest
	err = db.MongoDB.Collection("friend_requests").FindOne(ctx, bson.M{"sender_id": senderID, "receiver_id": receiver.ID, "status": "pending"}).Decode(&outgoingRequest)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Friend request already sent"})
		return
	}

	// 4. Create friend request
	newRequest := models.FriendRequest{
		ID:         primitive.NewObjectID(),
		SenderID:   senderID,
		ReceiverID: receiver.ID,
		Status:     "pending",
		CreatedAt:  time.Now(),
	}

	_, err = db.MongoDB.Collection("friend_requests").InsertOne(ctx, newRequest)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send friend request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Friend request sent successfully"})
}

func GetFriendRequests(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := db.MongoDB.Collection("friend_requests").Find(ctx, bson.M{"receiver_id": userID, "status": "pending"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query friend requests"})
		return
	}
	defer cursor.Close(ctx)

	var requests []models.FriendRequest
	if err = cursor.All(ctx, &requests); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode requests"})
		return
	}

	response := make([]FriendRequestResponse, 0)
	for _, req := range requests {
		var sender models.User
		err = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": req.SenderID}).Decode(&sender)
		if err == nil {
			response = append(response, FriendRequestResponse{
				RequestID:      req.ID.Hex(),
				SenderID:       req.SenderID.Hex(),
				SenderUsername: sender.Username,
				SenderNickname: sender.Nickname,
				CreatedAt:      req.CreatedAt,
			})
		}
	}

	c.JSON(http.StatusOK, response)
}

func HandleFriendRequest(c *gin.Context) {
	reqIDStr := c.Param("id")
	reqID, err := primitive.ObjectIDFromHex(reqIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request ID"})
		return
	}

	var req HandleFriendRequestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var friendReq models.FriendRequest
	err = db.MongoDB.Collection("friend_requests").FindOne(ctx, bson.M{"_id": reqID, "receiver_id": userID, "status": "pending"}).Decode(&friendReq)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Friend request not found or already processed"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if req.Status == "accepted" {
		err = establishFriendship(ctx, friendReq.SenderID, friendReq.ReceiverID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to establish friendship"})
			return
		}
	}

	_, err = db.MongoDB.Collection("friend_requests").UpdateOne(ctx, bson.M{"_id": reqID}, bson.M{"$set": bson.M{"status": req.Status}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update friend request status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Friend request processed successfully"})
}

func GetFriends(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := db.MongoDB.Collection("friends").Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query friends"})
		return
	}
	defer cursor.Close(ctx)

	var friends []models.Friend
	if err = cursor.All(ctx, &friends); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode friends"})
		return
	}

	friendIDs := make([]primitive.ObjectID, 0)
	friendRemarks := make(map[string]string)
	for _, f := range friends {
		friendIDs = append(friendIDs, f.FriendID)
		friendRemarks[f.FriendID.Hex()] = f.Remark
	}

	if len(friendIDs) == 0 {
		c.JSON(http.StatusOK, []models.FriendResponse{})
		return
	}

	cursorUsers, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": friendIDs}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query friend details"})
		return
	}
	defer cursorUsers.Close(ctx)

	var users []models.User
	if err = cursorUsers.All(ctx, &users); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode friend details"})
		return
	}

	response := make([]models.FriendResponse, 0)
	for _, u := range users {
		response = append(response, models.FriendResponse{
			ID:        u.ID.Hex(),
			Username:  u.Username,
			Nickname:  u.Nickname,
			Remark:    friendRemarks[u.ID.Hex()],
			CreatedAt: u.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, response)
}

func DeleteFriend(c *gin.Context) {
	friendIDStr := c.Param("id")
	friendID, err := primitive.ObjectIDFromHex(friendIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid friend ID"})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Delete both directions
	_, err = db.MongoDB.Collection("friends").DeleteMany(ctx, bson.M{
		"$or": []bson.M{
			{"user_id": userID, "friend_id": friendID},
			{"user_id": friendID, "friend_id": userID},
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete friend"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Friend deleted successfully"})
}

func establishFriendship(ctx context.Context, user1 primitive.ObjectID, user2 primitive.ObjectID) error {
	friendsCol := db.MongoDB.Collection("friends")

	// Insert A -> B
	_, err := friendsCol.InsertOne(ctx, models.Friend{
		ID:        primitive.NewObjectID(),
		UserID:    user1,
		FriendID:  user2,
		Remark:    "",
		CreatedAt: time.Now(),
	})
	if err != nil {
		return err
	}

	// Insert B -> A
	_, err = friendsCol.InsertOne(ctx, models.Friend{
		ID:        primitive.NewObjectID(),
		UserID:    user2,
		FriendID:  user1,
		Remark:    "",
		CreatedAt: time.Now(),
	})
	return err
}

func SearchUser(c *gin.Context) {
	username := strings.TrimSpace(strings.ToLower(c.Query("username")))
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user models.User
	err := db.MongoDB.Collection("users").FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, models.UserResponse{
		ID:        user.ID.Hex(),
		Username:  user.Username,
		Nickname:  user.Nickname,
		CreatedAt: user.CreatedAt,
	})
}

type UpdateRemarkReq struct {
	Remark string `json:"remark"`
}

func UpdateFriendRemark(c *gin.Context) {
	friendIDStr := c.Param("id")
	friendID, err := primitive.ObjectIDFromHex(friendIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid friend ID"})
		return
	}

	var req UpdateRemarkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Update remark in friends collection where user_id = userID and friend_id = friendID
	res, err := db.MongoDB.Collection("friends").UpdateOne(ctx,
		bson.M{"user_id": userID, "friend_id": friendID},
		bson.M{"$set": bson.M{"remark": strings.TrimSpace(req.Remark)}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update remark"})
		return
	}

	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Friend relationship not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Remark updated successfully"})
}

