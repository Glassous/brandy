package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"brandybackend/db"
	"brandybackend/middleware"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
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
	ReceiverID string `json:"receiver_id"`
	Content    string `json:"content"`
}

type MessageEventData struct {
	ID         string    `json:"id"`
	SenderID   string    `json:"sender_id"`
	ReceiverID string    `json:"receiver_id"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
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

			if payload.ReceiverID == "" || payload.Content == "" {
				continue
			}

			// Handle saving to DB and broadcasting
			go handleIncomingMessage(c.UserID, payload.ReceiverID, payload.Content)
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

func handleIncomingMessage(senderIDStr, receiverIDStr, content string) {
	senderID, _ := primitive.ObjectIDFromHex(senderIDStr)
	receiverID, _ := primitive.ObjectIDFromHex(receiverIDStr)

	// Verify friendship
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existingFriend models.Friend
	err := db.MongoDB.Collection("friends").FindOne(ctx, bson.M{"user_id": senderID, "friend_id": receiverID}).Decode(&existingFriend)
	if err != nil {
		log.Printf("Cannot send message: Users %s and %s are not friends", senderIDStr, receiverIDStr)
		return
	}

	// Save to DB
	msg := models.Message{
		ID:         primitive.NewObjectID(),
		SenderID:   senderID,
		ReceiverID: receiverID,
		Content:    content,
		IsRead:     false,
		CreatedAt:  time.Now(),
	}

	_, err = db.MongoDB.Collection("messages").InsertOne(ctx, msg)
	if err != nil {
		log.Printf("Failed to insert message into MongoDB: %v", err)
		return
	}

	eventData := MessageEventData{
		ID:         msg.ID.Hex(),
		SenderID:   senderIDStr,
		ReceiverID: receiverIDStr,
		Content:    content,
		CreatedAt:  msg.CreatedAt,
	}

	wsMsg := WSMessage{
		Event: "message",
		Data:  eventData,
	}

	wsMsgBytes, _ := json.Marshal(wsMsg)

	// Publish to Redis for the receiver
	db.RedisClient.Publish(context.Background(), "user_messages:"+receiverIDStr, wsMsgBytes)

	// Publish to Redis for the sender (to sync multiple devices if needed, or to confirm receipt)
	db.RedisClient.Publish(context.Background(), "user_messages:"+senderIDStr, wsMsgBytes)
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

	// Aggregation pipeline to find the last message with each friend
	pipeline := []bson.M{
		{
			"$match": bson.M{
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
				LastMessage:  rawChat.LastMessage,
				LastMsgTime:  rawChat.LastMsgTime,
				UnreadCount:  rawChat.UnreadCount,
			})
		}
	}

	c.JSON(http.StatusOK, response)
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
		ID         string    `json:"id"`
		SenderID   string    `json:"sender_id"`
		ReceiverID string    `json:"receiver_id"`
		Content    string    `json:"content"`
		CreatedAt  time.Time `json:"created_at"`
	}

	response := make([]MessageResponse, 0)
	for _, m := range dbMsgs {
		response = append(response, MessageResponse{
			ID:         m.ID.Hex(),
			SenderID:   m.SenderID.Hex(),
			ReceiverID: m.ReceiverID.Hex(),
			Content:    m.Content,
			CreatedAt:  m.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, response)
}
