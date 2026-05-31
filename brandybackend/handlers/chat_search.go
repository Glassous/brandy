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
)

type SearchResult struct {
	ID           string    `json:"id"`
	SenderID     string    `json:"sender_id"`
	ReceiverID   string    `json:"receiver_id,omitempty"`
	GroupID      string    `json:"group_id,omitempty"`
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"created_at"`
	SenderName   string    `json:"sender_name,omitempty"`
	SenderAvatar string    `json:"sender_avatar,omitempty"`
	ChatID       string    `json:"chat_id"` // Group ID or Friend ID
	ChatName     string    `json:"chat_name"`
	ChatAvatar   string    `json:"chat_avatar,omitempty"`
	IsGroup      bool      `json:"is_group"`
}

func SearchMessages(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	query := strings.TrimSpace(c.Query("query"))
	if query == "" {
		c.JSON(http.StatusOK, []SearchResult{})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Get all groups user is member of
	groupCursor, err := db.MongoDB.Collection("groups").Find(ctx, bson.M{"members": userID})
	var groupIDs []primitive.ObjectID = make([]primitive.ObjectID, 0)
	var groupsMap = make(map[string]models.Group)
	if err == nil {
		var groups []models.Group
		if groupCursor.All(ctx, &groups) == nil {
			for _, g := range groups {
				groupIDs = append(groupIDs, g.ID)
				groupsMap[g.ID.Hex()] = g
			}
		}
		groupCursor.Close(ctx)
	}

	// 2. Query messages
	// Filter: content matches regex, is not recalled, and (is private chat involving user OR is in user's groups)
	matchQuery := bson.M{"$regex": query, "$options": "i"}
	filter := bson.M{
		"content":     matchQuery,
		"is_recalled": bson.M{"$ne": true},
		"$or": []bson.M{
			{"sender_id": userID, "group_id": bson.M{"$exists": false}},
			{"receiver_id": userID, "group_id": bson.M{"$exists": false}},
			{"group_id": bson.M{"$in": groupIDs}},
		},
	}

	cursor, err := db.MongoDB.Collection("messages").Find(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search messages"})
		return
	}
	defer cursor.Close(ctx)

	var dbMsgs []models.Message
	if err = cursor.All(ctx, &dbMsgs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode messages"})
		return
	}

	// 3. Resolve user cache for nickname/avatar mapping
	userIDsMap := make(map[primitive.ObjectID]bool)
	for _, m := range dbMsgs {
		userIDsMap[m.SenderID] = true
		if m.ReceiverID != primitive.NilObjectID {
			userIDsMap[m.ReceiverID] = true
		}
	}
	var userIDs []primitive.ObjectID
	for id := range userIDsMap {
		userIDs = append(userIDs, id)
	}

	userMap := make(map[string]models.User)
	if len(userIDs) > 0 {
		uCursor, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": userIDs}})
		if err == nil {
			var users []models.User
			if uCursor.All(ctx, &users) == nil {
				for _, u := range users {
					userMap[u.ID.Hex()] = u
				}
			}
			uCursor.Close(ctx)
		}
	}

	// Resolve friend remarks
	friendRemarks := make(map[string]string)
	friendCursor, err := db.MongoDB.Collection("friends").Find(ctx, bson.M{"user_id": userID})
	if err == nil {
		var friends []models.Friend
		if friendCursor.All(ctx, &friends) == nil {
			for _, f := range friends {
				friendRemarks[f.FriendID.Hex()] = f.Remark
			}
		}
		friendCursor.Close(ctx)
	}

	// 4. Construct response
	results := make([]SearchResult, 0)
	for _, m := range dbMsgs {
		sender := userMap[m.SenderID.Hex()]
		sName := m.SenderName
		if sName == "" {
			sName = sender.Nickname
		}
		sAvatar := m.SenderAvatar
		if sAvatar == "" {
			sAvatar = sender.Avatar
		}

		var chatID string
		var chatName string
		var chatAvatar string
		isGroup := m.GroupID != primitive.NilObjectID

		if isGroup {
			chatID = m.GroupID.Hex()
			g := groupsMap[chatID]
			chatName = g.Name
			chatAvatar = g.Avatar
		} else {
			// Private chat: the other person is the chat target
			var otherID primitive.ObjectID
			if m.SenderID == userID {
				otherID = m.ReceiverID
			} else {
				otherID = m.SenderID
			}
			chatID = otherID.Hex()
			otherUser := userMap[chatID]
			
			// Use friend remark if available
			remark, hasRemark := friendRemarks[chatID]
			if hasRemark && remark != "" {
				chatName = remark
			} else {
				chatName = otherUser.Nickname
			}
			chatAvatar = otherUser.Avatar
		}

		results = append(results, SearchResult{
			ID:           m.ID.Hex(),
			SenderID:     m.SenderID.Hex(),
			ReceiverID:   m.ReceiverID.Hex(),
			GroupID:      m.GroupID.Hex(),
			Content:      m.Content,
			CreatedAt:    m.CreatedAt,
			SenderName:   sName,
			SenderAvatar: sAvatar,
			ChatID:       chatID,
			ChatName:     chatName,
			ChatAvatar:   chatAvatar,
			IsGroup:      isGroup,
		})
	}

	c.JSON(http.StatusOK, results)
}
