package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Username           string             `bson:"username" json:"username"`
	PasswordHash       string             `bson:"password_hash" json:"-"`
	Nickname           string             `bson:"nickname" json:"nickname"`
	SecurityQuestion   string             `bson:"security_question" json:"security_question"`
	SecurityAnswerHash string             `bson:"security_answer_hash" json:"-"`
	CreatedAt          time.Time          `bson:"created_at" json:"created_at"`
}

type Friend struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"user_id" json:"user_id"`
	FriendID  primitive.ObjectID `bson:"friend_id" json:"friend_id"`
	Remark    string             `bson:"remark" json:"remark"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

type FriendRequest struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	SenderID   primitive.ObjectID `bson:"sender_id" json:"sender_id"`
	ReceiverID primitive.ObjectID `bson:"receiver_id" json:"receiver_id"`
	Status     string             `bson:"status" json:"status"` // pending, accepted, rejected
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

type Message struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	SenderID   primitive.ObjectID `bson:"sender_id" json:"sender_id"`
	ReceiverID primitive.ObjectID `bson:"receiver_id" json:"receiver_id"`
	Content    string             `bson:"content" json:"content"`
	IsRead     bool               `bson:"is_read" json:"is_read"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

// REST request/response shapes helper
type UserResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Nickname  string    `json:"nickname"`
	CreatedAt time.Time `json:"created_at"`
}

type ChatSession struct {
	FriendID      string    `json:"friend_id"`
	FriendName    string    `json:"friend_name"`
	FriendRemark  string    `json:"friend_remark"`
	LastMessage   string    `json:"last_message"`
	LastMsgTime   time.Time `json:"last_msg_time"`
	UnreadCount   int64     `json:"unread_count"`
}

type FriendResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Nickname  string    `json:"nickname"`
	Remark    string    `json:"remark"`
	CreatedAt time.Time `json:"created_at"`
}
