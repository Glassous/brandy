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
	Avatar             string             `bson:"avatar" json:"avatar"`
	Email              string             `bson:"email" json:"email"`
	CustomTransferPath string             `bson:"custom_transfer_path" json:"custom_transfer_path"`
	IsAI               bool               `bson:"is_ai,omitempty" json:"is_ai,omitempty"`
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
	ReceiverID primitive.ObjectID `bson:"receiver_id,omitempty" json:"receiver_id,omitempty"`
	GroupID    primitive.ObjectID `bson:"group_id,omitempty" json:"group_id,omitempty"`
	Content    string             `bson:"content" json:"content"`
	IsRead     bool               `bson:"is_read" json:"is_read"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

type Group struct {
	ID        primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name      string               `bson:"name" json:"name"`
	OwnerID   primitive.ObjectID   `bson:"owner_id" json:"owner_id"`
	Admins    []primitive.ObjectID `bson:"admins" json:"admins"`
	Members   []primitive.ObjectID `bson:"members" json:"members"`
	CreatedAt time.Time            `bson:"created_at" json:"created_at"`
}

// REST request/response shapes helper
type UserResponse struct {
	ID                 string    `json:"id"`
	Username           string    `json:"username"`
	Nickname           string    `json:"nickname"`
	Avatar             string    `json:"avatar"`
	CustomTransferPath string    `json:"custom_transfer_path"`
	IsAI               bool      `json:"is_ai,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
}

type GroupResponse struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	OwnerID   string             `json:"owner_id"`
	Admins    []string           `json:"admins"`
	Members   []UserResponse     `json:"members"`
	AIMembers []AIMemberResponse `json:"ai_members,omitempty"`
	CreatedAt time.Time          `json:"created_at"`
}

type ChatSession struct {
	FriendID      string    `json:"friend_id,omitempty"`
	FriendName    string    `json:"friend_name,omitempty"`
	FriendRemark  string    `json:"friend_remark,omitempty"`
	FriendAvatar  string    `json:"friend_avatar,omitempty"`
	GroupID       string    `json:"group_id,omitempty"`
	GroupName     string    `json:"group_name,omitempty"`
	GroupAvatar   string    `json:"group_avatar,omitempty"`
	IsGroup       bool      `json:"is_group"`
	LastMessage   string    `json:"last_message"`
	LastMsgTime   time.Time `json:"last_msg_time"`
	UnreadCount   int64     `json:"unread_count"`
}

type FriendResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Nickname  string    `json:"nickname"`
	Remark    string    `json:"remark"`
	Avatar    string    `json:"avatar"`
	CreatedAt time.Time `json:"created_at"`
}

type DiskItem struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID       primitive.ObjectID  `bson:"user_id" json:"user_id"`
	ParentID     *primitive.ObjectID `bson:"parent_id,omitempty" json:"parent_id"`
	OriginItemID *primitive.ObjectID `bson:"origin_item_id,omitempty" json:"origin_item_id"`
	Name         string              `bson:"name" json:"name"`
	Type         string              `bson:"type" json:"type"`
	Size         int64               `bson:"size,omitempty" json:"size"`
	CosKey       string              `bson:"cos_key,omitempty" json:"cos_key"`
	SourceCosKey string              `bson:"source_cos_key,omitempty" json:"source_cos_key"`
	URL          string              `bson:"url,omitempty" json:"url"`
	CreatedAt    time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time           `bson:"updated_at" json:"updated_at"`
}

type AIMember struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GroupID     primitive.ObjectID `bson:"group_id" json:"group_id"`
	Name        string             `bson:"name" json:"name"`
	Personality string             `bson:"personality" json:"personality"`
	Avatar      string             `bson:"avatar" json:"avatar"`
	UserID      primitive.ObjectID `bson:"user_id" json:"user_id"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

type AIMemberResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Personality string    `json:"personality"`
	Avatar      string    `json:"avatar"`
	UserID      string    `json:"user_id"`
	CreatedAt   time.Time `json:"created_at"`
}

