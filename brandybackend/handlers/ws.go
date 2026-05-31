package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"brandybackend/db"
	"brandybackend/middleware"
	"brandybackend/models"
	"brandybackend/utils"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Client represents a connected user
type Client struct {
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
}

// Hub manages active connections
type Hub struct {
	clients    map[string]*Client
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

var GlobalHub = Hub{
	clients:    make(map[string]*Client),
	register:   make(chan *Client),
	unregister: make(chan *Client),
}

func (h *Hub) Start() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.UserID] = client
			h.mu.Unlock()
			log.Printf("User %s connected", client.UserID)
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; ok {
				delete(h.clients, client.UserID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("User %s disconnected", client.UserID)
		}
	}
}

type WSMessage struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

type RawMessagePayload struct {
	ReceiverID      string `json:"receiver_id,omitempty"`
	GroupID         string `json:"group_id,omitempty"`
	Content         string `json:"content"`
	QuoteID         string `json:"quote_id,omitempty"`
	QuoteSenderName string `json:"quote_sender_name,omitempty"`
	QuoteContent    string `json:"quote_content,omitempty"`
}

type MessageEventData struct {
	ID              string    `json:"id"`
	SenderID        string    `json:"sender_id"`
	ReceiverID      string    `json:"receiver_id,omitempty"`
	GroupID         string    `json:"group_id,omitempty"`
	Content         string    `json:"content"`
	SenderName      string    `json:"sender_name,omitempty"`
	SenderAvatar    string    `json:"sender_avatar,omitempty"`
	IsRecalled      bool      `json:"is_recalled"`
	RecalledAt      *time.Time`json:"recalled_at,omitempty"`
	IsEdited        bool      `json:"is_edited"`
	QuoteID         string    `json:"quote_id,omitempty"`
	QuoteSenderName string    `json:"quote_sender_name,omitempty"`
	QuoteContent    string    `json:"quote_content,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// HandleWS upgrades HTTP connection and registers the user
func HandleWS(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token is required"})
		return
	}

	userID, err := middleware.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}

	client := &Client{
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	GlobalHub.register <- client

	// Start Redis subscription for this user
	go subscribeUserMessages(client)

	// Start reading and writing loops
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		GlobalHub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024) // 512KB
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			log.Printf("json unmarshal error: %v", err)
			continue
		}

		if wsMsg.Event == "message" {
			rawPayload, err := json.Marshal(wsMsg.Data)
			if err != nil {
				continue
			}

			var payload RawMessagePayload
			if err := json.Unmarshal(rawPayload, &payload); err != nil {
				continue
			}

			if payload.Content == "" {
				continue
			}

			if payload.ReceiverID != "" {
				go handleIncomingMessage(c.UserID, payload)
			} else if payload.GroupID != "" {
				go handleIncomingGroupMessage(c.UserID, payload)
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func sendWSError(userIDStr, errMsg string) {
	wsMsg := WSMessage{
		Event: "error",
		Data: gin.H{
			"message": errMsg,
		},
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)
	db.RedisClient.Publish(context.Background(), "user_messages:"+userIDStr, wsMsgBytes)
}

func handleIncomingMessage(senderIDStr string, payload RawMessagePayload) {
	senderID, _ := primitive.ObjectIDFromHex(senderIDStr)
	receiverID, _ := primitive.ObjectIDFromHex(payload.ReceiverID)

	// Verify friendship
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existingFriend models.Friend
	err := db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": senderID, "friend_id": receiverID}).Decode(&existingFriend)
	if err != nil {
		log.Printf("Cannot send message: Users %s and %s are not friends", senderIDStr, payload.ReceiverID)
		return
	}

	var sender models.User
	db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": senderID}).Decode(&sender)

	var quoteID *primitive.ObjectID = nil
	if payload.QuoteID != "" {
		if qid, err := primitive.ObjectIDFromHex(payload.QuoteID); err == nil {
			quoteID = &qid
		}
	}

	// Save to DB
	msg := models.Message{
		ID:              primitive.NewObjectID(),
		SenderID:        senderID,
		ReceiverID:      receiverID,
		Content:         payload.Content,
		IsRead:          false,
		SenderName:      sender.Nickname,
		SenderAvatar:    sender.Avatar,
		QuoteID:         quoteID,
		QuoteSenderName: payload.QuoteSenderName,
		QuoteContent:    payload.QuoteContent,
		CreatedAt:       time.Now(),
	}

	_, err = db.MongoDB.Collection("messages").InsertOne(ctx, msg)
	if err != nil {
		log.Printf("Failed to insert message into MongoDB: %v", err)
		return
	}

	eventData := MessageEventData{
		ID:              msg.ID.Hex(),
		SenderID:        senderIDStr,
		ReceiverID:      payload.ReceiverID,
		Content:         payload.Content,
		SenderName:      sender.Nickname,
		SenderAvatar:    sender.Avatar,
		QuoteID:         payload.QuoteID,
		QuoteSenderName: payload.QuoteSenderName,
		QuoteContent:    payload.QuoteContent,
		CreatedAt:       msg.CreatedAt,
	}

	wsMsg := WSMessage{
		Event: "message",
		Data:  eventData,
	}

	wsMsgBytes, _ := json.Marshal(wsMsg)

	// Publish to Redis for the receiver
	db.RedisClient.Publish(context.Background(), "user_messages:"+payload.ReceiverID, wsMsgBytes)

	// Publish to Redis for the sender (to sync multiple devices if needed, or to confirm receipt)
	db.RedisClient.Publish(context.Background(), "user_messages:"+senderIDStr, wsMsgBytes)
}

func handleIncomingGroupMessage(senderIDStr string, payload RawMessagePayload) {
	senderID, _ := primitive.ObjectIDFromHex(senderIDStr)
	groupID, _ := primitive.ObjectIDFromHex(payload.GroupID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group membership
	var group models.Group
	err := db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": senderID}).Decode(&group)
	if err != nil {
		log.Printf("Cannot send group message: User %s is not a member of group %s", senderIDStr, payload.GroupID)
		return
	}

	// Check muting
	if group.MuteAll && group.OwnerID != senderID {
		sendWSError(senderIDStr, "全体禁言中")
		return
	}
	if muteInfo, ok := group.MutedMembers[senderIDStr]; ok {
		if muteInfo.MutedAt.After(time.Now()) { // Individual muting is active
			sendWSError(senderIDStr, "您已被禁言")
			return
		}
	}

	var sender models.User
	db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": senderID}).Decode(&sender)

	var quoteID *primitive.ObjectID = nil
	if payload.QuoteID != "" {
		if qid, err := primitive.ObjectIDFromHex(payload.QuoteID); err == nil {
			quoteID = &qid
		}
	}

	// Save to MongoDB
	msg := models.Message{
		ID:              primitive.NewObjectID(),
		SenderID:        senderID,
		GroupID:         groupID,
		Content:         payload.Content,
		IsRead:          false,
		SenderName:      sender.Nickname,
		SenderAvatar:    sender.Avatar,
		QuoteID:         quoteID,
		QuoteSenderName: payload.QuoteSenderName,
		QuoteContent:    payload.QuoteContent,
		CreatedAt:       time.Now(),
	}

	_, err = db.MongoDB.Collection("messages").InsertOne(ctx, msg)
	if err != nil {
		log.Printf("Failed to insert group message into MongoDB: %v", err)
		return
	}

	eventData := MessageEventData{
		ID:              msg.ID.Hex(),
		SenderID:        senderIDStr,
		GroupID:         payload.GroupID,
		Content:         payload.Content,
		SenderName:      sender.Nickname,
		SenderAvatar:    sender.Avatar,
		QuoteID:         payload.QuoteID,
		QuoteSenderName: payload.QuoteSenderName,
		QuoteContent:    payload.QuoteContent,
		CreatedAt:       msg.CreatedAt,
	}

	wsMsg := WSMessage{
		Event: "message",
		Data:  eventData,
	}

	wsMsgBytes, _ := json.Marshal(wsMsg)

	// Broadcast to all group members via Redis pub/sub
	for _, memberID := range group.Members {
		db.RedisClient.Publish(context.Background(), "user_messages:"+memberID.Hex(), wsMsgBytes)
	}

	// Check if message mentions an AI member
	if aiName := extractAIMention(payload.Content); aiName != "" {
		go triggerAIResponse(payload.GroupID, aiName, senderIDStr, payload.Content)
	}
}

func extractAIMention(content string) string {
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "@") {
		return ""
	}

	parts := strings.SplitN(content, " ", 2)
	if len(parts) == 0 {
		return ""
	}

	aiName := strings.TrimPrefix(parts[0], "@")
	if aiName == "" {
		return ""
	}

	return aiName
}

func triggerAIResponse(groupIDStr, aiName, senderIDStr, originalMsg string) {
	log.Printf("[AI] Triggering AI response for group=%s, aiName=%s, sender=%s", groupIDStr, aiName, senderIDStr)

	groupID, _ := primitive.ObjectIDFromHex(groupIDStr)
	senderID, _ := primitive.ObjectIDFromHex(senderIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Find AI member
	var aiMember models.AIMember
	err := db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{
		"group_id": groupID,
		"name":     aiName,
	}).Decode(&aiMember)
	if err != nil {
		log.Printf("[AI] AI member '%s' not found in group %s: %v", aiName, groupIDStr, err)
		return
	}
	log.Printf("[AI] Found AI member: %s (UserID: %s)", aiMember.Name, aiMember.UserID.Hex())

	// Get sender name
	var sender models.User
	err = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": senderID}).Decode(&sender)
	if err != nil {
		log.Printf("[AI] Failed to get sender info: %v", err)
		return
	}

	// Get recent 30 messages for context
	recentMessages := utils.GetRecentGroupMessages(ctx, groupID, 30)
	log.Printf("[AI] Got %d recent messages for context", len(recentMessages))

	// Build OpenAI messages
	chatMessages := utils.BuildChatMessages(
		aiMember.Name,
		aiMember.Personality,
		recentMessages,
		sender.Nickname,
		originalMsg,
		aiMember.UserID,
	)
	log.Printf("[AI] Built %d chat messages for OpenAI", len(chatMessages))

	// Call OpenAI
	response, err := utils.CallOpenAI(ctx, chatMessages)
	if err != nil {
		log.Printf("[AI] Failed to call OpenAI: %v", err)
		// Send error message as AI response so user can see the error
		errMsg := fmt.Sprintf("抱歉，我暂时无法回复：%v", err)
		saveAndBroadcastAIResponse(ctx, groupID, groupIDStr, aiMember, errMsg)
		return
	}

	if response == "" {
		log.Printf("[AI] Empty response from OpenAI")
		saveAndBroadcastAIResponse(ctx, groupID, groupIDStr, aiMember, "抱歉，我暂时无法回复（空响应）")
		return
	}

	log.Printf("[AI] Got response from OpenAI: %s", response[:min(100, len(response))])
	saveAndBroadcastAIResponse(ctx, groupID, groupIDStr, aiMember, response)
}

func saveAndBroadcastAIResponse(ctx context.Context, groupID primitive.ObjectID, groupIDStr string, aiMember models.AIMember, response string) {
	// Save AI response to messages
	aiMsg := models.Message{
		ID:           primitive.NewObjectID(),
		SenderID:     aiMember.UserID,
		GroupID:      groupID,
		Content:      response,
		IsRead:       false,
		SenderName:   aiMember.Name,
		SenderAvatar: aiMember.Avatar,
		CreatedAt:    time.Now(),
	}

	_, err := db.MongoDB.Collection("messages").InsertOne(ctx, aiMsg)
	if err != nil {
		log.Printf("[AI] Failed to insert AI message: %v", err)
		return
	}
	log.Printf("[AI] Saved AI message with ID: %s", aiMsg.ID.Hex())

	// Broadcast AI response
	eventData := MessageEventData{
		ID:           aiMsg.ID.Hex(),
		SenderID:     aiMember.UserID.Hex(),
		GroupID:      groupIDStr,
		Content:      response,
		SenderName:   aiMember.Name,
		SenderAvatar: aiMember.Avatar,
		CreatedAt:    aiMsg.CreatedAt,
	}

	wsMsg := WSMessage{
		Event: "message",
		Data:  eventData,
	}

	wsMsgBytes, _ := json.Marshal(wsMsg)

	// Get group members for broadcast
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err == nil {
		for _, memberID := range group.Members {
			db.RedisClient.Publish(context.Background(), "user_messages:"+memberID.Hex(), wsMsgBytes)
		}
		log.Printf("[AI] Broadcasted AI response to %d group members", len(group.Members))
	}
}

func subscribeUserMessages(client *Client) {
	pubsub := db.RedisClient.Subscribe(context.Background(), "user_messages:"+client.UserID)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		// Verify connection still exists
		GlobalHub.mu.RLock()
		activeClient, exists := GlobalHub.clients[client.UserID]
		GlobalHub.mu.RUnlock()

		if !exists || activeClient != client {
			break // Connection has been closed or replaced
		}

		client.Send <- []byte(msg.Payload)
	}
}

// GetChats lists all recent chat sessions
func GetChats(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Aggregation pipeline to find the last message with each friend in private chats
	pipeline := []bson.M{
		{
			"$match": bson.M{
				"group_id": bson.M{"$exists": false}, // Only private chats
				"$or": []bson.M{
					{"sender_id": userID},
					{"receiver_id": userID},
				},
			},
		},
		{
			"$sort": bson.M{"created_at": -1},
		},
		{
			"$group": bson.M{
				"_id": bson.M{
					"$cond": []interface{}{
						bson.M{"$eq": []interface{}{"$sender_id", userID}},
						"$receiver_id",
						"$sender_id",
					},
				},
				"last_message": bson.M{"$first": "$content"},
				"last_msg_time": bson.M{"$first": "$created_at"},
				"unread_count": bson.M{
					"$sum": bson.M{
						"$cond": []interface{}{
							bson.M{
								"$and": []bson.M{
									{"$eq": []interface{}{"$receiver_id", userID}},
									{"$eq": []interface{}{"$is_read", false}},
								},
							},
							1,
							0,
						},
					},
				},
			},
		},
	}

	cursor, err := db.MongoDB.Collection("messages").Aggregate(ctx, pipeline)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to aggregate chat sessions"})
		return
	}
	defer cursor.Close(ctx)

	type AggregatedChat struct {
		FriendID    primitive.ObjectID `bson:"_id"`
		LastMessage string             `bson:"last_message"`
		LastMsgTime time.Time          `bson:"last_msg_time"`
		UnreadCount int64              `bson:"unread_count"`
	}

	var rawChats []AggregatedChat
	if err = cursor.All(ctx, &rawChats); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode aggregated chats"})
		return
	}

	response := make([]models.ChatSession, 0)
	for _, rawChat := range rawChats {
		// Fetch friend info
		var friend models.User
		err = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": rawChat.FriendID}).Decode(&friend)
		if err == nil {
			// Fetch friend relationship to get remark
			var rel models.Friend
			remark := ""
			err = db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": userID, "friend_id": rawChat.FriendID}).Decode(&rel)
			if err == nil {
				remark = rel.Remark
			}

			response = append(response, models.ChatSession{
				FriendID:     rawChat.FriendID.Hex(),
				FriendName:   friend.Nickname,
				FriendRemark: remark,
				FriendAvatar: friend.Avatar,
				IsGroup:      false,
				LastMessage:  rawChat.LastMessage,
				LastMsgTime:  rawChat.LastMsgTime,
				UnreadCount:  rawChat.UnreadCount,
			})
		}
	}

	// 2. Fetch group chats and calculate session details
	var groups []models.Group
	gCursor, err := db.MongoDB.Collection("groups").Find(ctx, bson.M{"members": userID})
	if err == nil {
		gCursor.All(ctx, &groups)
		gCursor.Close(ctx)
	}

	for _, g := range groups {
		var lastMsg models.Message
		err := db.MongoDB.Collection("messages").FindOne(
			ctx,
			bson.M{"group_id": g.ID},
			options.FindOne().SetSort(bson.M{"created_at": -1}),
		).Decode(&lastMsg)

		lastMessage := ""
		lastMsgTime := g.CreatedAt
		if err == nil {
			lastMessage = lastMsg.Content
			lastMsgTime = lastMsg.CreatedAt
		}

		// Calculate group name if empty
		gName := g.Name
		if gName == "" {
			var memberNames []string
			limit := len(g.Members)
			if limit > 4 {
				limit = 4
			}
			for i := 0; i < limit; i++ {
				var member models.User
				err := db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": g.Members[i]}).Decode(&member)
				if err == nil {
					memberNames = append(memberNames, member.Nickname)
				}
			}
			if len(memberNames) > 0 {
				gName = strings.Join(memberNames, ", ")
				if len(g.Members) > 4 {
					gName += "..."
				}
			} else {
				gName = "群聊"
			}
		}

		response = append(response, models.ChatSession{
			GroupID:     g.ID.Hex(),
			GroupName:   gName,
			GroupAvatar: g.Avatar,
			IsGroup:     true,
			LastMessage: lastMessage,
			LastMsgTime: lastMsgTime,
			UnreadCount: 0, // Client tracks locally
		})
	}

	// Sort response sessions by LastMsgTime descending
	sortChatsByTime(response)

	c.JSON(http.StatusOK, response)
}

// Helper to sort chat sessions by last message time
func sortChatsByTime(chats []models.ChatSession) {
	for i := 0; i < len(chats); i++ {
		for j := i + 1; j < len(chats); j++ {
			if chats[i].LastMsgTime.Before(chats[j].LastMsgTime) {
				chats[i], chats[j] = chats[j], chats[i]
			}
		}
	}
}

// GetChatMessages retrieves the conversation history with a specific friend
func GetChatMessages(c *gin.Context) {
	friendIDStr := c.Param("friend_id")
	friendID, err := primitive.ObjectIDFromHex(friendIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid friend ID"})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify friendship
	var existingFriend models.Friend
	err = db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": userID, "friend_id": friendID}).Decode(&existingFriend)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not friends with this user"})
		return
	}

	// Mark incoming messages as read
	_, err = db.MongoDB.Collection("messages").UpdateMany(ctx, bson.M{
		"sender_id":   friendID,
		"receiver_id": userID,
		"is_read":     false,
	}, bson.M{"$set": bson.M{"is_read": true}})
	if err != nil {
		log.Printf("Failed to mark messages as read: %v", err)
	}

	// Fetch messages sorted by time
	opts := options.Find().SetSort(bson.M{"created_at": 1})
	filter := bson.M{
		"$or": []bson.M{
			{"sender_id": userID, "receiver_id": friendID},
			{"sender_id": friendID, "receiver_id": userID},
		},
	}

	sinceStr := c.Query("since")
	if sinceStr != "" {
		sinceTime, err := time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			sinceTime, err = time.Parse(time.RFC3339Nano, sinceStr)
		}
		if err == nil {
			filter["created_at"] = bson.M{"$gt": sinceTime}
		} else {
			log.Printf("Failed to parse since parameter '%s': %v", sinceStr, err)
		}
	}

	cursor, err := db.MongoDB.Collection("messages").Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chat history"})
		return
	}
	defer cursor.Close(ctx)

	var dbMsgs []models.Message
	if err = cursor.All(ctx, &dbMsgs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode messages"})
		return
	}

	type MessageResponse struct {
		ID              string    `json:"id"`
		SenderID        string    `json:"sender_id"`
		ReceiverID      string    `json:"receiver_id"`
		Content         string    `json:"content"`
		SenderName      string    `json:"sender_name,omitempty"`
		SenderAvatar    string    `json:"sender_avatar,omitempty"`
		IsRecalled      bool      `json:"is_recalled"`
		RecalledAt      *time.Time`json:"recalled_at,omitempty"`
		IsEdited        bool      `json:"is_edited"`
		QuoteID         string    `json:"quote_id,omitempty"`
		QuoteSenderName string    `json:"quote_sender_name,omitempty"`
		QuoteContent    string    `json:"quote_content,omitempty"`
		CreatedAt       time.Time `json:"created_at"`
	}

	// For compatibility/fallback, query users to populate missing names/avatars in history
	userCache := make(map[primitive.ObjectID]models.User)

	response := make([]MessageResponse, 0)
	for _, m := range dbMsgs {
		sName := m.SenderName
		sAvatar := m.SenderAvatar
		if sName == "" {
			u, exists := userCache[m.SenderID]
			if !exists {
				db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": m.SenderID}).Decode(&u)
				userCache[m.SenderID] = u
			}
			sName = u.Nickname
			sAvatar = u.Avatar
		}

		quoteIDStr := ""
		if m.QuoteID != nil {
			quoteIDStr = m.QuoteID.Hex()
		}

		response = append(response, MessageResponse{
			ID:              m.ID.Hex(),
			SenderID:        m.SenderID.Hex(),
			ReceiverID:      m.ReceiverID.Hex(),
			Content:         m.Content,
			SenderName:      sName,
			SenderAvatar:    sAvatar,
			IsRecalled:      m.IsRecalled,
			RecalledAt:      m.RecalledAt,
			IsEdited:        m.IsEdited,
			QuoteID:         quoteIDStr,
			QuoteSenderName: m.QuoteSenderName,
			QuoteContent:    m.QuoteContent,
			CreatedAt:       m.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, response)
}

// RecallMessage handles soft deleting a message within 5 minutes
func RecallMessage(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	msgIDStr := c.Param("id")
	msgID, err := primitive.ObjectIDFromHex(msgIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("messages")

	var msg models.Message
	err = collection.FindOne(ctx, bson.M{"_id": msgID}).Decode(&msg)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify owner
	if msg.SenderID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only recall your own messages"})
		return
	}

	// Verify time <= 5 minutes
	if time.Since(msg.CreatedAt) > 5*time.Minute {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You can only recall messages sent within 5 minutes"})
		return
	}

	now := time.Now()
	_, err = collection.UpdateOne(ctx, bson.M{"_id": msgID}, bson.M{
		"$set": bson.M{
			"is_recalled": true,
			"recalled_at": now,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to recall message"})
		return
	}

	// Broadcast recall event via Redis pub/sub
	eventData := gin.H{
		"message_id":  msgIDStr,
		"sender_id":   userIDStr,
		"receiver_id": msg.ReceiverID.Hex(),
		"group_id":    msg.GroupID.Hex(),
		"is_recalled": true,
	}

	wsMsg := WSMessage{
		Event: "message_recall",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	if msg.GroupID != primitive.NilObjectID {
		// Broadcast to all group members
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": msg.GroupID}).Decode(&group)
		if err == nil {
			for _, mID := range group.Members {
				db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
			}
		}
	} else {
		// Broadcast to receiver and sender
		db.RedisClient.Publish(context.Background(), "user_messages:"+msg.ReceiverID.Hex(), wsMsgBytes)
		db.RedisClient.Publish(context.Background(), "user_messages:"+userIDStr, wsMsgBytes)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Message recalled successfully"})
}

// EditMessage handles editing a message
type EditMessageReq struct {
	Content string `json:"content" binding:"required"`
}

func EditMessage(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	msgIDStr := c.Param("id")
	msgID, err := primitive.ObjectIDFromHex(msgIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	var req EditMessageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	collection := db.MongoDB.Collection("messages")

	var msg models.Message
	err = collection.FindOne(ctx, bson.M{"_id": msgID}).Decode(&msg)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify owner
	if msg.SenderID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own messages"})
		return
	}

	if msg.IsRecalled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot edit recalled messages"})
		return
	}

	now := time.Now()
	_, err = collection.UpdateOne(ctx, bson.M{"_id": msgID}, bson.M{
		"$set": bson.M{
			"content":    req.Content,
			"is_edited":  true,
			"updated_at": now,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to edit message"})
		return
	}

	// Broadcast edit event
	eventData := gin.H{
		"message_id":  msgIDStr,
		"content":     req.Content,
		"sender_id":   userIDStr,
		"receiver_id": msg.ReceiverID.Hex(),
		"group_id":    msg.GroupID.Hex(),
		"is_edited":   true,
	}

	wsMsg := WSMessage{
		Event: "message_edit",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	if msg.GroupID != primitive.NilObjectID {
		// Broadcast to all group members
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": msg.GroupID}).Decode(&group)
		if err == nil {
			for _, mID := range group.Members {
				db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
			}
		}
	} else {
		// Broadcast to receiver and sender
		db.RedisClient.Publish(context.Background(), "user_messages:"+msg.ReceiverID.Hex(), wsMsgBytes)
		db.RedisClient.Publish(context.Background(), "user_messages:"+userIDStr, wsMsgBytes)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Message edited successfully"})
}
