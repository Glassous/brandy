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
	Role               string             `bson:"role,omitempty" json:"role,omitempty"`
	CreatedAt          time.Time          `bson:"created_at" json:"created_at"`
	Bio                string             `bson:"bio" json:"bio"`
	Gender             string             `bson:"gender" json:"gender"`
	Birthday           string             `bson:"birthday" json:"birthday"`
	Country            string             `bson:"country" json:"country"`
	City               string             `bson:"city" json:"city"`
	Website            string             `bson:"website" json:"website"`
	Job                string             `bson:"job" json:"job"`
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
	ID               primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	SenderID         primitive.ObjectID  `bson:"sender_id" json:"sender_id"`
	ReceiverID       primitive.ObjectID  `bson:"receiver_id,omitempty" json:"receiver_id,omitempty"`
	GroupID          primitive.ObjectID  `bson:"group_id,omitempty" json:"group_id,omitempty"`
	Content          string              `bson:"content" json:"content"`
	IsRead           bool                `bson:"is_read" json:"is_read"`
	SenderName       string              `bson:"sender_name,omitempty" json:"sender_name,omitempty"`
	SenderAvatar     string              `bson:"sender_avatar,omitempty" json:"sender_avatar,omitempty"`
	IsRecalled       bool                `bson:"is_recalled" json:"is_recalled"`
	RecalledAt       *time.Time          `bson:"recalled_at,omitempty" json:"recalled_at,omitempty"`
	IsEdited         bool                `bson:"is_edited" json:"is_edited"`
	QuoteID          *primitive.ObjectID `bson:"quote_id,omitempty" json:"quote_id,omitempty"`
	QuoteSenderName  string              `bson:"quote_sender_name,omitempty" json:"quote_sender_name,omitempty"`
	QuoteContent     string              `bson:"quote_content,omitempty" json:"quote_content,omitempty"`
	CreatedAt        time.Time           `bson:"created_at" json:"created_at"`
}

type MuteInfo struct {
	MutedBy string    `bson:"muted_by" json:"muted_by"` // "owner" or "admin"
	MutedAt time.Time `bson:"muted_at" json:"muted_at"`
}

type Group struct {
	ID           primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name         string               `bson:"name" json:"name"`
	OwnerID      primitive.ObjectID   `bson:"owner_id" json:"owner_id"`
	Admins       []primitive.ObjectID `bson:"admins" json:"admins"`
	Members      []primitive.ObjectID `bson:"members" json:"members"`
	Announcement string               `bson:"announcement" json:"announcement"`
	MuteAll      bool                 `bson:"mute_all" json:"mute_all"`
	MutedMembers map[string]MuteInfo  `bson:"muted_members,omitempty" json:"muted_members,omitempty"`
	CreatedAt    time.Time            `bson:"created_at" json:"created_at"`
	Avatar       string               `bson:"avatar" json:"avatar"`
}

// REST request/response shapes helper
type UserResponse struct {
	ID                 string    `json:"id"`
	Username           string    `json:"username"`
	Nickname           string    `json:"nickname"`
	Avatar             string    `json:"avatar"`
	CustomTransferPath string    `json:"custom_transfer_path"`
	IsAI               bool      `json:"is_ai,omitempty"`
	Role               string    `json:"role,omitempty"`
	DiskUsed           *int64    `json:"disk_used,omitempty"`
	DiskLimit          *int64    `json:"disk_limit,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	Bio                string    `json:"bio"`
	Gender             string    `json:"gender"`
	Birthday           string    `json:"birthday"`
	Country            string    `json:"country"`
	City               string    `json:"city"`
	Website            string    `json:"website"`
	Job                string    `json:"job"`
}

type GroupResponse struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	OwnerID      string             `json:"owner_id"`
	Admins       []string           `json:"admins"`
	Members      []UserResponse     `json:"members"`
	AIMembers    []AIMemberResponse `json:"ai_members,omitempty"`
	Announcement string             `json:"announcement"`
	MuteAll      bool               `json:"mute_all"`
	MutedMembers map[string]MuteInfo  `json:"muted_members,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	Avatar       string             `json:"avatar"`
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
	ID              primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID          primitive.ObjectID  `bson:"user_id" json:"user_id"`
	ParentID        *primitive.ObjectID `bson:"parent_id,omitempty" json:"parent_id"`
	OriginItemID    *primitive.ObjectID `bson:"origin_item_id,omitempty" json:"origin_item_id"`
	Name            string              `bson:"name" json:"name"`
	Type            string              `bson:"type" json:"type"`
	Size            int64               `bson:"size,omitempty" json:"size"`
	CosKey          string              `bson:"cos_key,omitempty" json:"cos_key"`
	SourceCosKey    string              `bson:"source_cos_key,omitempty" json:"source_cos_key"`
	URL             string              `bson:"url,omitempty" json:"url"`
	IsDeleted       bool                `bson:"is_deleted" json:"is_deleted"`
	DirectlyDeleted bool                `bson:"directly_deleted" json:"directly_deleted"`
	DeletedAt       *time.Time          `bson:"deleted_at,omitempty" json:"deleted_at,omitempty"`
	CreatedAt       time.Time           `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time           `bson:"updated_at" json:"updated_at"`
	GroupID         *primitive.ObjectID `bson:"group_id,omitempty" json:"group_id,omitempty"`
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

type GroupAuditLog struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GroupID    primitive.ObjectID `bson:"group_id" json:"group_id"`
	OperatorID primitive.ObjectID `bson:"operator_id" json:"operator_id"`
	Action     string             `bson:"action" json:"action"`
	Details    string             `bson:"details" json:"details"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

type GamePlayer struct {
	UserID   string `bson:"user_id" json:"user_id"`
	Nickname string `bson:"nickname" json:"nickname"`
	Avatar   string `bson:"avatar" json:"avatar"`
	Score    int    `bson:"score" json:"score"`
}

type GameRound struct {
	RoundNum int                    `bson:"round_num" json:"round_num"`
	Moves    map[string]interface{} `bson:"moves" json:"moves"` // user_id -> move (RPS: rock/paper/scissors, Dice: number 1-6)
	WinnerID string                 `bson:"winner_id" json:"winner_id"` // user_id or "draw"
}

type Game struct {
	ID                 primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Type               string               `bson:"type" json:"type"` // "rps" or "dice"
	ChatID             string               `bson:"chat_id" json:"chat_id"`
	IsGroup            bool                 `bson:"is_group" json:"is_group"`
	CreatorID          string               `bson:"creator_id" json:"creator_id"`
	CreatorName        string               `bson:"creator_name" json:"creator_name"`
	Status             string               `bson:"status" json:"status"` // "pending", "active", "finished"
	Players            []GamePlayer         `bson:"players" json:"players"`
	Rounds             []GameRound          `bson:"rounds" json:"rounds"`
	MaxRounds          int                  `bson:"max_rounds" json:"max_rounds"`
	CurrentRound       int                  `bson:"current_round" json:"current_round"`
	WinnerID           string               `bson:"winner_id" json:"winner_id"`
	WinnerName         string               `bson:"winner_name" json:"winner_name"`
	MessageID          string               `bson:"message_id" json:"message_id"`
	RequireDecisiveWin bool                 `bson:"require_decisive_win" json:"require_decisive_win"`
	CreatedAt          time.Time            `bson:"created_at" json:"created_at"`
	UpdatedAt          time.Time            `bson:"updated_at" json:"updated_at"`
}

type Sticker struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"user_id" json:"user_id"`
	URL       string             `bson:"url" json:"url"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

