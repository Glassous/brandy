package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type CreateGroupReq struct {
	Name    string   `json:"name"`
	Members []string `json:"members" binding:"required"`
}

type UpdateGroupReq struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
}

type AddGroupMembersReq struct {
	Members []string `json:"members" binding:"required"`
}

type GroupAdminReq struct {
	UserID string `json:"user_id" binding:"required"`
}

func CreateGroup(c *gin.Context) {
	var req CreateGroupReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Parse members
	memberMap := make(map[primitive.ObjectID]bool)
	memberMap[currentUserID] = true // Add creator automatically

	for _, mStr := range req.Members {
		mID, err := primitive.ObjectIDFromHex(mStr)
		if err == nil {
			memberMap[mID] = true
		}
	}

	memberIDs := make([]primitive.ObjectID, 0, len(memberMap))
	for mID := range memberMap {
		memberIDs = append(memberIDs, mID)
	}

	// Create Group
	newGroup := models.Group{
		ID:        primitive.NewObjectID(),
		Name:      strings.TrimSpace(req.Name),
		OwnerID:   currentUserID,
		Admins:    make([]primitive.ObjectID, 0),
		Members:   memberIDs,
		CreatedAt: time.Now(),
	}

	_, err := db.MongoDB.Collection("groups").InsertOne(ctx, newGroup)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group"})
		return
	}

	writeGroupAuditLog(ctx, newGroup.ID, currentUserID, "create", "创建了群聊: "+newGroup.Name)

	// Resolve member details for response
	var members []models.UserResponse
	cursor, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": memberIDs}})
	if err == nil {
		var dbUsers []models.User
		if cursor.All(ctx, &dbUsers) == nil {
			for _, u := range dbUsers {
				members = append(members, models.UserResponse{
					ID:        u.ID.Hex(),
					Username:  u.Username,
					Nickname:  u.Nickname,
					Avatar:    u.Avatar,
					CreatedAt: u.CreatedAt,
				})
			}
		}
		cursor.Close(ctx)
	}

	c.JSON(http.StatusCreated, models.GroupResponse{
		ID:        newGroup.ID.Hex(),
		Name:      newGroup.Name,
		OwnerID:   newGroup.OwnerID.Hex(),
		Admins:    make([]string, 0),
		Members:   members,
		CreatedAt: newGroup.CreatedAt,
		Avatar:    newGroup.Avatar,
	})
}

func GetGroups(c *gin.Context) {
	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := db.MongoDB.Collection("groups").Find(ctx, bson.M{"members": currentUserID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query groups"})
		return
	}
	defer cursor.Close(ctx)

	var groups []models.Group
	if err = cursor.All(ctx, &groups); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode groups"})
		return
	}

	response := make([]models.GroupResponse, 0)
	for _, g := range groups {
		var members []models.UserResponse
		mCursor, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": g.Members}})
		if err == nil {
			var dbUsers []models.User
			if mCursor.All(ctx, &dbUsers) == nil {
				for _, u := range dbUsers {
					members = append(members, models.UserResponse{
						ID:        u.ID.Hex(),
						Username:  u.Username,
						Nickname:  u.Nickname,
						Avatar:    u.Avatar,
						CreatedAt: u.CreatedAt,
					})
				}
			}
			mCursor.Close(ctx)
		}

		admins := make([]string, 0)
		for _, a := range g.Admins {
			admins = append(admins, a.Hex())
		}

		response = append(response, models.GroupResponse{
			ID:        g.ID.Hex(),
			Name:      g.Name,
			OwnerID:   g.OwnerID.Hex(),
			Admins:    admins,
			Members:   members,
			CreatedAt: g.CreatedAt,
			Avatar:    g.Avatar,
		})
	}

	c.JSON(http.StatusOK, response)
}

func GetGroupDetail(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	var members []models.UserResponse
	cursor, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": group.Members}})
	if err == nil {
		var dbUsers []models.User
		if cursor.All(ctx, &dbUsers) == nil {
			for _, u := range dbUsers {
				// Skip AI users - they are shown separately in ai_members
				if u.IsAI {
					continue
				}
				members = append(members, models.UserResponse{
					ID:        u.ID.Hex(),
					Username:  u.Username,
					Nickname:  u.Nickname,
					Avatar:    u.Avatar,
					IsAI:      u.IsAI,
					CreatedAt: u.CreatedAt,
				})
			}
		}
		cursor.Close(ctx)
	}

	admins := make([]string, 0)
	for _, a := range group.Admins {
		admins = append(admins, a.Hex())
	}

	// Get AI members for this group
	var aiMembers []models.AIMemberResponse
	aiCursor, err := db.MongoDB.Collection("ai_members").Find(ctx, bson.M{"group_id": groupID})
	if err == nil {
		var aiMemberList []models.AIMember
		if aiCursor.All(ctx, &aiMemberList) == nil {
			for _, ai := range aiMemberList {
				aiMembers = append(aiMembers, models.AIMemberResponse{
					ID:          ai.ID.Hex(),
					Name:        ai.Name,
					Personality: ai.Personality,
					Avatar:      ai.Avatar,
					UserID:      ai.UserID.Hex(),
					CreatedAt:   ai.CreatedAt,
				})
			}
		}
		aiCursor.Close(ctx)
	}

	c.JSON(http.StatusOK, models.GroupResponse{
		ID:           group.ID.Hex(),
		Name:         group.Name,
		OwnerID:      group.OwnerID.Hex(),
		Admins:       admins,
		Members:      members,
		AIMembers:    aiMembers,
		Announcement: group.Announcement,
		MuteAll:      group.MuteAll,
		MutedMembers: group.MutedMembers,
		CreatedAt:    group.CreatedAt,
		Avatar:       group.Avatar,
	})
}

func UpdateGroup(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req UpdateGroupReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find group
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify permissions: only Owner or Admins can update name/avatar
	isAuthorized := group.OwnerID == currentUserID
	if !isAuthorized {
		for _, adminID := range group.Admins {
			if adminID == currentUserID {
				isAuthorized = true
				break
			}
		}
	}

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can change group information"})
		return
	}

	updateFields := bson.M{}
	nameChanged := false
	avatarChanged := false
	if req.Name != "" && strings.TrimSpace(req.Name) != group.Name {
		updateFields["name"] = strings.TrimSpace(req.Name)
		nameChanged = true
	}
	if req.Avatar != "" && strings.TrimSpace(req.Avatar) != group.Avatar {
		updateFields["avatar"] = strings.TrimSpace(req.Avatar)
		avatarChanged = true
	}

	if len(updateFields) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No changes made"})
		return
	}

	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$set": updateFields},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group information"})
		return
	}

	if nameChanged {
		writeGroupAuditLog(ctx, groupID, currentUserID, "rename", "修改群名为: "+strings.TrimSpace(req.Name))
	}
	if avatarChanged {
		writeGroupAuditLog(ctx, groupID, currentUserID, "update_avatar", "更新了群头像")
	}

	c.JSON(http.StatusOK, gin.H{"message": "Group updated successfully"})
}

func AddGroupMembers(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req AddGroupMembersReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if group exists and current user is member
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Convert new members to ObjectID
	newMemberIDs := make([]primitive.ObjectID, 0)
	for _, mStr := range req.Members {
		mID, err := primitive.ObjectIDFromHex(mStr)
		if err == nil {
			newMemberIDs = append(newMemberIDs, mID)
		}
	}

	if len(newMemberIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid member IDs provided"})
		return
	}

	// Add to set of members in MongoDB
	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$addToSet": bson.M{"members": bson.M{"$each": newMemberIDs}}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add group members"})
		return
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "add_member", fmt.Sprintf("邀请了 %d 名新成员入群", len(newMemberIDs)))

	c.JSON(http.StatusOK, gin.H{"message": "Members added successfully"})
}

func RemoveGroupMember(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	targetUserIDStr := c.Param("user_id")
	targetUserID, err := primitive.ObjectIDFromHex(targetUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target user ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find group
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check if current user is a member
	isCurrentMember := false
	for _, m := range group.Members {
		if m == currentUserID {
			isCurrentMember = true
			break
		}
	}
	if !isCurrentMember {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
		return
	}

	// Determine authorization
	isOwner := group.OwnerID == currentUserID
	isAdmin := false
	for _, a := range group.Admins {
		if a == currentUserID {
			isAdmin = true
			break
		}
	}

	isSelfLeave := currentUserID == targetUserID
	isAuthorized := isSelfLeave || isOwner || (isAdmin && group.OwnerID != targetUserID)

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to remove this member"})
		return
	}

	// Cannot kick group owner (unless it's self-leave, but owner leaving is handled specially below)
	if !isSelfLeave && group.OwnerID == targetUserID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot remove the group owner"})
		return
	}

	// Pull from members and admins
	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{
			"$pull": bson.M{
				"members": targetUserID,
				"admins":  targetUserID,
			},
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove member"})
		return
	}

	// If group owner left, we need to assign a new owner
	if isSelfLeave && group.OwnerID == currentUserID {
		// Fetch updated group members
		var updatedGroup models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&updatedGroup)
		if err == nil {
			if len(updatedGroup.Members) == 0 {
				// Delete group if empty
				db.MongoDB.Collection("groups").DeleteOne(ctx, bson.M{"_id": groupID})
				db.MongoDB.Collection("messages").DeleteMany(ctx, bson.M{"group_id": groupID})
			} else {
				// Promote first remaining member or admin to owner
				newOwnerID := updatedGroup.Members[0]
				if len(updatedGroup.Admins) > 0 {
					newOwnerID = updatedGroup.Admins[0]
				}
				db.MongoDB.Collection("groups").UpdateOne(
					ctx,
					bson.M{"_id": groupID},
					bson.M{"$set": bson.M{"owner_id": newOwnerID}},
				)
			}
		}
	}

	// Fetch target user's nickname for logging
	var targetUser models.User
	_ = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": targetUserID}).Decode(&targetUser)
	targetName := targetUser.Nickname
	if targetName == "" {
		targetName = targetUserIDStr
	}

	if isSelfLeave {
		writeGroupAuditLog(ctx, groupID, currentUserID, "leave", "退出了群聊")
	} else {
		writeGroupAuditLog(ctx, groupID, currentUserID, "kick", fmt.Sprintf("将成员 %s 移出了群聊", targetName))
	}

	c.JSON(http.StatusOK, gin.H{"message": "Member removed successfully"})
}

func AddGroupAdmin(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req GroupAdminReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	targetUserID, err := primitive.ObjectIDFromHex(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target user ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find group and verify current user is owner
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "owner_id": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the group owner can manage administrators"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify target is a member of the group
	isMember := false
	for _, m := range group.Members {
		if m == targetUserID {
			isMember = true
			break
		}
	}

	if !isMember {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target user is not a member of this group"})
		return
	}

	// Add to admins
	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$addToSet": bson.M{"admins": targetUserID}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add administrator"})
		return
	}

	// Fetch target user's nickname for logging
	var targetUser models.User
	_ = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": targetUserID}).Decode(&targetUser)
	targetName := targetUser.Nickname
	if targetName == "" {
		targetName = req.UserID
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "add_admin", fmt.Sprintf("将成员 %s 设为管理员", targetName))

	c.JSON(http.StatusOK, gin.H{"message": "Administrator added successfully"})
}

func RemoveGroupAdmin(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	targetUserIDStr := c.Param("user_id")
	targetUserID, err := primitive.ObjectIDFromHex(targetUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target user ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find group and verify current user is owner
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "owner_id": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the group owner can manage administrators"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Pull from admins
	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$pull": bson.M{"admins": targetUserID}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove administrator"})
		return
	}

	// Fetch target user's nickname for logging
	var targetUser models.User
	_ = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": targetUserID}).Decode(&targetUser)
	targetName := targetUser.Nickname
	if targetName == "" {
		targetName = targetUserIDStr
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "remove_admin", fmt.Sprintf("取消了成员 %s 的管理员身份", targetName))

	c.JSON(http.StatusOK, gin.H{"message": "Administrator removed successfully"})
}

func GetGroupMessages(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group membership
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": userID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Fetch messages sorted by time
	opts := options.Find().SetSort(bson.M{"created_at": 1})
	filter := bson.M{
		"group_id": groupID,
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

	// For compatibility/fallback, query users & AI members to populate missing names/avatars in history
	userCache := make(map[primitive.ObjectID]models.User)
	aiCache := make(map[primitive.ObjectID]models.AIMember)

	response := make([]MessageResponse, 0)
	for _, m := range dbMsgs {
		sName := m.SenderName
		sAvatar := m.SenderAvatar
		if sName == "" {
			ai, exists := aiCache[m.SenderID]
			if !exists {
				err = db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{"user_id": m.SenderID, "group_id": groupID}).Decode(&ai)
				if err == nil {
					aiCache[m.SenderID] = ai
				}
			}
			if ai.Name != "" {
				sName = ai.Name
				sAvatar = ai.Avatar
			} else {
				u, exists := userCache[m.SenderID]
				if !exists {
					db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": m.SenderID}).Decode(&u)
					userCache[m.SenderID] = u
				}
				sName = u.Nickname
				sAvatar = u.Avatar
			}
		}

		quoteIDStr := ""
		if m.QuoteID != nil {
			quoteIDStr = m.QuoteID.Hex()
		}

		response = append(response, MessageResponse{
			ID:              m.ID.Hex(),
			SenderID:        m.SenderID.Hex(),
			GroupID:         m.GroupID.Hex(),
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

// AI Member Management

type AddAIMemberReq struct {
	Name        string `json:"name" binding:"required"`
	Personality string `json:"personality"`
	Avatar      string `json:"avatar"`
}

func AddAIMember(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req AddAIMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if group exists and current user is member
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify permissions: only Owner or Admins can add AI members
	isAuthorized := group.OwnerID == currentUserID
	if !isAuthorized {
		for _, adminID := range group.Admins {
			if adminID == currentUserID {
				isAuthorized = true
				break
			}
		}
	}
	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can add AI members"})
		return
	}

	// Check if AI member name already exists in this group
	var existingAI models.AIMember
	err = db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{
		"group_id": groupID,
		"name":     strings.TrimSpace(req.Name),
	}).Decode(&existingAI)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "AI member with this name already exists in the group"})
		return
	}

	// Create virtual user for AI
	aiUser := models.User{
		ID:        primitive.NewObjectID(),
		Username:  "ai_" + primitive.NewObjectID().Hex(),
		Nickname:  strings.TrimSpace(req.Name),
		Avatar:    req.Avatar,
		IsAI:      true,
		CreatedAt: time.Now(),
	}

	_, err = db.MongoDB.Collection("users").InsertOne(ctx, aiUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create AI user"})
		return
	}

	// Create AI member record
	aiMember := models.AIMember{
		ID:          primitive.NewObjectID(),
		GroupID:     groupID,
		Name:        strings.TrimSpace(req.Name),
		Personality: strings.TrimSpace(req.Personality),
		Avatar:      req.Avatar,
		UserID:      aiUser.ID,
		CreatedAt:   time.Now(),
	}

	_, err = db.MongoDB.Collection("ai_members").InsertOne(ctx, aiMember)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create AI member"})
		return
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "add_ai", "添加了AI虚拟成员: "+req.Name)

	c.JSON(http.StatusCreated, models.AIMemberResponse{
		ID:          aiMember.ID.Hex(),
		Name:        aiMember.Name,
		Personality: aiMember.Personality,
		Avatar:      aiMember.Avatar,
		UserID:      aiUser.ID.Hex(),
		CreatedAt:   aiMember.CreatedAt,
	})
}

func GetAIMembers(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if group exists and current user is member
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Get AI members
	cursor, err := db.MongoDB.Collection("ai_members").Find(ctx, bson.M{"group_id": groupID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch AI members"})
		return
	}
	defer cursor.Close(ctx)

	var aiMembers []models.AIMember
	if err = cursor.All(ctx, &aiMembers); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode AI members"})
		return
	}

	response := make([]models.AIMemberResponse, 0)
	for _, ai := range aiMembers {
		response = append(response, models.AIMemberResponse{
			ID:          ai.ID.Hex(),
			Name:        ai.Name,
			Personality: ai.Personality,
			Avatar:      ai.Avatar,
			UserID:      ai.UserID.Hex(),
			CreatedAt:   ai.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, response)
}

func UpdateAIMember(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	aiIDStr := c.Param("ai_id")
	aiID, err := primitive.ObjectIDFromHex(aiIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid AI member ID"})
		return
	}

	var req AddAIMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if group exists and current user is member
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify permissions: only Owner or Admins can update AI members
	isAuthorized := group.OwnerID == currentUserID
	if !isAuthorized {
		for _, adminID := range group.Admins {
			if adminID == currentUserID {
				isAuthorized = true
				break
			}
		}
	}
	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can modify AI members"})
		return
	}

	// Check if AI member exists
	var aiMember models.AIMember
	err = db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{"_id": aiID, "group_id": groupID}).Decode(&aiMember)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "AI member not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check name uniqueness if name changed
	if strings.TrimSpace(req.Name) != aiMember.Name {
		var existingAI models.AIMember
		err = db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{
			"group_id": groupID,
			"name":     strings.TrimSpace(req.Name),
			"_id":      bson.M{"$ne": aiID},
		}).Decode(&existingAI)
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "AI member with this name already exists in the group"})
			return
		}
	}

	// Update AI member
	update := bson.M{
		"$set": bson.M{
			"name":        strings.TrimSpace(req.Name),
			"personality": strings.TrimSpace(req.Personality),
			"avatar":      req.Avatar,
		},
	}

	_, err = db.MongoDB.Collection("ai_members").UpdateOne(ctx, bson.M{"_id": aiID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update AI member"})
		return
	}

	// Update virtual user nickname and avatar
	_, err = db.MongoDB.Collection("users").UpdateOne(
		ctx,
		bson.M{"_id": aiMember.UserID},
		bson.M{"$set": bson.M{"nickname": strings.TrimSpace(req.Name), "avatar": req.Avatar}},
	)
	if err != nil {
		log.Printf("Failed to update AI user: %v", err)
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "update_ai", "更新了AI成员信息: "+req.Name)

	c.JSON(http.StatusOK, gin.H{"message": "AI member updated successfully"})
}

func RemoveAIMember(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	aiIDStr := c.Param("ai_id")
	aiID, err := primitive.ObjectIDFromHex(aiIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid AI member ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if group exists and current user is member
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": currentUserID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found or you are not a member"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify permissions: only Owner or Admins can remove AI members
	isAuthorized := group.OwnerID == currentUserID
	if !isAuthorized {
		for _, adminID := range group.Admins {
			if adminID == currentUserID {
				isAuthorized = true
				break
			}
		}
	}
	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can remove AI members"})
		return
	}

	// Check if AI member exists
	var aiMember models.AIMember
	err = db.MongoDB.Collection("ai_members").FindOne(ctx, bson.M{"_id": aiID, "group_id": groupID}).Decode(&aiMember)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "AI member not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Delete AI member record
	_, err = db.MongoDB.Collection("ai_members").DeleteOne(ctx, bson.M{"_id": aiID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete AI member"})
		return
	}

	// Delete AI user
	_, err = db.MongoDB.Collection("users").DeleteOne(ctx, bson.M{"_id": aiMember.UserID})
	if err != nil {
		log.Printf("Failed to delete AI user: %v", err)
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "remove_ai", "移除了AI虚拟成员: "+aiMember.Name)

	c.JSON(http.StatusOK, gin.H{"message": "AI member removed successfully"})
}

// 18. 修改群公告
type UpdateAnnouncementReq struct {
	Announcement string `json:"announcement"`
}

func UpdateGroupAnnouncement(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req UpdateAnnouncementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group and permissions (Owner or Admin)
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	isAuthorized := group.OwnerID == currentUserID
	if !isAuthorized {
		for _, adminID := range group.Admins {
			if adminID == currentUserID {
				isAuthorized = true
				break
			}
		}
	}

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can update announcement"})
		return
	}

	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$set": bson.M{"announcement": req.Announcement}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update announcement"})
		return
	}

	// Broadcast group update event to all members
	eventData := gin.H{
		"group_id":     groupIDStr,
		"announcement": req.Announcement,
	}
	wsMsg := WSMessage{
		Event: "group_announcement_update",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)
	for _, mID := range group.Members {
		db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
	}

	writeGroupAuditLog(ctx, groupID, currentUserID, "announcement_update", "更新了群公告")

	c.JSON(http.StatusOK, gin.H{"message": "Announcement updated successfully"})
}

// 19. 解散群聊
func DissolveGroup(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify group exists and user is owner
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	if group.OwnerID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the group owner can dissolve the group"})
		return
	}

	// Delete group document
	_, err = db.MongoDB.Collection("groups").DeleteOne(ctx, bson.M{"_id": groupID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to dissolve group"})
		return
	}

	// Delete all group messages
	_, _ = db.MongoDB.Collection("messages").DeleteMany(ctx, bson.M{"group_id": groupID})

	// Delete group AI members
	_, _ = db.MongoDB.Collection("ai_members").DeleteMany(ctx, bson.M{"group_id": groupID})

	// Broadcast group_dissolved to all members
	eventData := gin.H{
		"group_id": groupIDStr,
	}
	wsMsg := WSMessage{
		Event: "group_dissolved",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)
	for _, mID := range group.Members {
		db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Group dissolved successfully"})
}

// 20. 全员禁言/解除全员禁言
type MuteAllReq struct {
	MuteAll bool `json:"mute_all"`
}

func MuteAllGroup(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req MuteAllReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group and check if user is owner
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	if group.OwnerID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the group owner can manage mute all status"})
		return
	}

	_, err = db.MongoDB.Collection("groups").UpdateOne(
		ctx,
		bson.M{"_id": groupID},
		bson.M{"$set": bson.M{"mute_all": req.MuteAll}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update mute all status"})
		return
	}

	if req.MuteAll {
		writeGroupAuditLog(ctx, groupID, currentUserID, "mute_all", "开启了全员禁言")
	} else {
		writeGroupAuditLog(ctx, groupID, currentUserID, "unmute_all", "关闭了全员禁言")
	}

	// Broadcast group_mute_all event
	eventData := gin.H{
		"group_id": groupIDStr,
		"mute_all": req.MuteAll,
	}
	wsMsg := WSMessage{
		Event: "group_mute_all",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)
	for _, mID := range group.Members {
		db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Group mute all status updated successfully"})
}

// 21. 禁言/解除禁言特定成员
type MuteMemberReq struct {
	UserID string `json:"user_id" binding:"required"`
	Mute   bool   `json:"mute"`
}

func MuteGroupMember(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	var req MuteMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUserIDStr := c.GetString("userID")
	currentUserID, _ := primitive.ObjectIDFromHex(currentUserIDStr)

	targetUserIDStr := req.UserID
	targetUserID, err := primitive.ObjectIDFromHex(targetUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target User ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	// Determine roles
	isOwner := group.OwnerID == currentUserID
	isAdmin := false
	for _, adminID := range group.Admins {
		if adminID == currentUserID {
			isAdmin = true
			break
		}
	}

	isTargetOwner := group.OwnerID == targetUserID

	if !isOwner && !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only group owner or administrators can manage mutes"})
		return
	}

	if req.Mute {
		// Individual mute rules:
		// Owner can mute anyone.
		// Admin can only mute regular members (not owner, and not themselves).
		if isAdmin {
			if isTargetOwner {
				c.JSON(http.StatusForbidden, gin.H{"error": "Administrators cannot mute the group owner"})
				return
			}
			if targetUserID == currentUserID {
				c.JSON(http.StatusForbidden, gin.H{"error": "Administrators cannot mute themselves"})
				return
			}
		}

		muterRole := "admin"
		if isOwner {
			muterRole = "owner"
		}

		// Update Group's MutedMembers map
		if group.MutedMembers == nil {
			group.MutedMembers = make(map[string]models.MuteInfo)
		}

		farFuture := time.Now().AddDate(100, 0, 0)
		_, err = db.MongoDB.Collection("groups").UpdateOne(
			ctx,
			bson.M{"_id": groupID},
			bson.M{"$set": bson.M{"muted_members." + targetUserIDStr: models.MuteInfo{
				MutedBy: muterRole,
				MutedAt: farFuture,
			}}},
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mute member"})
			return
		}

	} else {
		// Unmute rules:
		muteDetails, ok := group.MutedMembers[targetUserIDStr]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Member is not muted"})
			return
		}

		// If target was muted by owner, only owner can unmute!
		if muteDetails.MutedBy == "owner" && !isOwner {
			c.JSON(http.StatusForbidden, gin.H{"error": "This member was muted by the group owner and can only be unmuted by the owner"})
			return
		}

		_, err = db.MongoDB.Collection("groups").UpdateOne(
			ctx,
			bson.M{"_id": groupID},
			bson.M{"$unset": bson.M{"muted_members." + targetUserIDStr: ""}},
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unmute member"})
			return
		}
	}

	// Fetch target user's nickname for logging
	var targetUser models.User
	_ = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": targetUserID}).Decode(&targetUser)
	targetName := targetUser.Nickname
	if targetName == "" {
		targetName = targetUserIDStr
	}

	if req.Mute {
		writeGroupAuditLog(ctx, groupID, currentUserID, "mute_member", fmt.Sprintf("对成员 %s 开启了禁言", targetName))
	} else {
		writeGroupAuditLog(ctx, groupID, currentUserID, "unmute_member", fmt.Sprintf("对成员 %s 解除了禁言", targetName))
	}

	// Broadcast group_mute_member event
	eventData := gin.H{
		"group_id": groupIDStr,
		"user_id":  targetUserIDStr,
		"mute":     req.Mute,
	}
	wsMsg := WSMessage{
		Event: "group_mute_member",
		Data:  eventData,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)
	for _, mID := range group.Members {
		db.RedisClient.Publish(context.Background(), "user_messages:"+mID.Hex(), wsMsgBytes)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Member mute status updated successfully"})
}

func writeGroupAuditLog(ctx context.Context, groupID primitive.ObjectID, operatorID primitive.ObjectID, action string, details string) {
	logEntry := models.GroupAuditLog{
		ID:         primitive.NewObjectID(),
		GroupID:    groupID,
		OperatorID: operatorID,
		Action:     action,
		Details:    details,
		CreatedAt:  time.Now(),
	}
	_, err := db.MongoDB.Collection("group_audit_logs").InsertOne(ctx, logEntry)
	if err != nil {
		log.Printf("Failed to write group audit log: %v", err)
	}
}

func GetGroupAuditLogs(c *gin.Context) {
	groupIDStr := c.Param("group_id")
	groupID, err := primitive.ObjectIDFromHex(groupIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify group membership
	var group models.Group
	err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID, "members": userID}).Decode(&group)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this group"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Fetch logs sorted by created_at desc
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := db.MongoDB.Collection("group_audit_logs").Find(ctx, bson.M{"group_id": groupID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch audit logs"})
		return
	}
	defer cursor.Close(ctx)

	var dbLogs []models.GroupAuditLog
	if err = cursor.All(ctx, &dbLogs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode audit logs"})
		return
	}

	// Resolve operators nicknames for display
	userIDs := make([]primitive.ObjectID, 0)
	for _, l := range dbLogs {
		userIDs = append(userIDs, l.OperatorID)
	}

	userMap := make(map[string]string)
	if len(userIDs) > 0 {
		userCursor, err := db.MongoDB.Collection("users").Find(ctx, bson.M{"_id": bson.M{"$in": userIDs}})
		if err == nil {
			var users []models.User
			if userCursor.All(ctx, &users) == nil {
				for _, u := range users {
					userMap[u.ID.Hex()] = u.Nickname
				}
			}
			userCursor.Close(ctx)
		}
	}

	type LogResponse struct {
		ID           string    `json:"id"`
		GroupID      string    `json:"group_id"`
		OperatorID   string    `json:"operator_id"`
		OperatorName string    `json:"operator_name"`
		Action       string    `json:"action"`
		Details      string    `json:"details"`
		CreatedAt    time.Time `json:"created_at"`
	}

	response := make([]LogResponse, 0)
	for _, l := range dbLogs {
		name, exists := userMap[l.OperatorID.Hex()]
		if !exists {
			name = "未知用户"
		}
		response = append(response, LogResponse{
			ID:           l.ID.Hex(),
			GroupID:      l.GroupID.Hex(),
			OperatorID:   l.OperatorID.Hex(),
			OperatorName: name,
			Action:       l.Action,
			Details:      l.Details,
			CreatedAt:    l.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, response)
}
