package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CreateGame creates a new game room
func CreateGame(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)

	var req struct {
		Type        string `json:"type"` // "rps" or "dice"
		ChatID      string `json:"chat_id"`
		IsGroup     bool   `json:"is_group"`
		BestOf      int    `json:"best_of"`
		DecisiveWin bool   `json:"decisive_win"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Type != "rps" && req.Type != "dice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported game type"})
		return
	}

	if req.BestOf < 1 || req.BestOf > 9 || req.BestOf%2 == 0 {
		req.BestOf = 3
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get creator user details
	var creator models.User
	err := db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": userID}).Decode(&creator)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Creator not found"})
		return
	}

	gameID := primitive.NewObjectID()
	messageID := primitive.NewObjectID()

	gamePlayer := models.GamePlayer{
		UserID:   userIDStr,
		Nickname: creator.Nickname,
		Avatar:   creator.Avatar,
		Score:    0,
	}

	// Create initial game object
	game := models.Game{
		ID:                 gameID,
		Type:               req.Type,
		ChatID:             req.ChatID,
		IsGroup:            req.IsGroup,
		CreatorID:          userIDStr,
		CreatorName:        creator.Nickname,
		Status:             "pending",
		Players:            []models.GamePlayer{gamePlayer},
		Rounds:             []models.GameRound{},
		MaxRounds:          req.BestOf,
		CurrentRound:       1,
		MessageID:          messageID.Hex(),
		RequireDecisiveWin: req.DecisiveWin,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	// Insert game into DB
	_, err = db.MongoDB.Collection("games").InsertOne(ctx, game)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create game"})
		return
	}

	// Generate game card JSON message content
	gameCardContent := map[string]interface{}{
		"type":         "game_card",
		"game_id":      gameID.Hex(),
		"game_type":    req.Type,
		"status":       "pending",
		"creator_id":   userIDStr,
		"creator_name": creator.Nickname,
		"winner_name":  "",
	}
	gameCardBytes, _ := json.Marshal(gameCardContent)

	// Create and insert chat message
	msg := models.Message{
		ID:           messageID,
		SenderID:     userID,
		Content:      string(gameCardBytes),
		IsRead:       false,
		SenderName:   creator.Nickname,
		SenderAvatar: creator.Avatar,
		CreatedAt:    time.Now(),
	}

	var targets []string
	if req.IsGroup {
		groupID, _ := primitive.ObjectIDFromHex(req.ChatID)
		msg.GroupID = groupID
		// Get group members to broadcast message to
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
		if err == nil {
			for _, m := range group.Members {
				targets = append(targets, m.Hex())
			}
		}
	} else {
		friendID, _ := primitive.ObjectIDFromHex(req.ChatID)
		msg.ReceiverID = friendID
		targets = append(targets, userIDStr, req.ChatID)
	}

	// Save message to MongoDB
	_, err = db.MongoDB.Collection("messages").InsertOne(ctx, msg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save game message"})
		return
	}

	// Broadcast message via WebSocket
	wsMsg := WSMessage{
		Event: "message",
		Data: MessageEventData{
			ID:           msg.ID.Hex(),
			SenderID:     userIDStr,
			ReceiverID:   msg.ReceiverID.Hex(),
			GroupID:      msg.GroupID.Hex(),
			Content:      msg.Content,
			SenderName:   msg.SenderName,
			SenderAvatar: msg.SenderAvatar,
			CreatedAt:    msg.CreatedAt,
		},
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	for _, target := range targets {
		db.RedisClient.Publish(ctx, "user_messages:"+target, wsMsgBytes)
	}

	c.JSON(http.StatusOK, game)
}

// GetGame retrieves a game room state
func GetGame(c *gin.Context) {
	gameIDStr := c.Param("id")
	gameID, err := primitive.ObjectIDFromHex(gameIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var game models.Game
	err = db.MongoDB.Collection("games").FindOne(ctx, bson.M{"_id": gameID}).Decode(&game)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	c.JSON(http.StatusOK, game)
}

// JoinGame joins an existing game room
func JoinGame(c *gin.Context) {
	userIDStr := c.GetString("userID")
	userID, _ := primitive.ObjectIDFromHex(userIDStr)
	gameIDStr := c.Param("id")
	gameID, err := primitive.ObjectIDFromHex(gameIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var game models.Game
	err = db.MongoDB.Collection("games").FindOne(ctx, bson.M{"_id": gameID}).Decode(&game)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game is not in pending state"})
		return
	}

	// Check if already in game
	alreadyIn := false
	for _, p := range game.Players {
		if p.UserID == userIDStr {
			alreadyIn = true
			break
		}
	}

	if alreadyIn {
		c.JSON(http.StatusOK, game)
		return
	}

	if len(game.Players) >= 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game room is full"})
		return
	}

	// Get joining user details
	var user models.User
	err = db.MongoDB.Collection("users").FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User details not found"})
		return
	}

	newPlayer := models.GamePlayer{
		UserID:   userIDStr,
		Nickname: user.Nickname,
		Avatar:   user.Avatar,
		Score:    0,
	}

	game.Players = append(game.Players, newPlayer)
	game.Status = "active"
	game.UpdatedAt = time.Now()

	// Update game in DB
	_, err = db.MongoDB.Collection("games").UpdateOne(ctx, bson.M{"_id": gameID}, bson.M{
		"$set": bson.M{
			"players":    game.Players,
			"status":     game.Status,
			"updated_at": game.UpdatedAt,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join game"})
		return
	}

	// Update game_card status in original message
	updateGameMessageStatus(ctx, game, "active", "")

	// Broadcast game update to participants
	broadcastGameUpdate(ctx, game)

	c.JSON(http.StatusOK, game)
}

// MakeMove records a player move
func MakeMove(c *gin.Context) {
	userIDStr := c.GetString("userID")
	gameIDStr := c.Param("id")
	gameID, err := primitive.ObjectIDFromHex(gameIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	var req struct {
		Move interface{} `json:"move"` // RPS: "rock", "paper", "scissors"; Dice: int (1-6)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var game models.Game
	err = db.MongoDB.Collection("games").FindOne(ctx, bson.M{"_id": gameID}).Decode(&game)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	if game.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Game is not active"})
		return
	}

	// Verify player belongs in game
	playerIndex := -1
	for idx, p := range game.Players {
		if p.UserID == userIDStr {
			playerIndex = idx
			break
		}
	}
	if playerIndex == -1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a player in this game"})
		return
	}

	// Find or create current round object
	var currentRound models.GameRound
	roundIndex := -1
	for idx, r := range game.Rounds {
		if r.RoundNum == game.CurrentRound {
			currentRound = r
			roundIndex = idx
			break
		}
	}

	if roundIndex == -1 {
		currentRound = models.GameRound{
			RoundNum: game.CurrentRound,
			Moves:    make(map[string]interface{}),
			WinnerID: "",
		}
	}

	// If player already made a move in this round, ignore/error
	if _, ok := currentRound.Moves[userIDStr]; ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You already made a move for this round"})
		return
	}

	currentRound.Moves[userIDStr] = req.Move

	// If both players have made their moves
	if len(currentRound.Moves) == 2 {
		// Determine winner of this round
		winnerID := determineRoundWinner(game.Type, game.Players[0].UserID, game.Players[1].UserID, currentRound.Moves)
		currentRound.WinnerID = winnerID

		// Update scores
		if winnerID != "draw" {
			for idx, p := range game.Players {
				if p.UserID == winnerID {
					game.Players[idx].Score++
					break
				}
			}
		}

		// Update round list
		if roundIndex == -1 {
			game.Rounds = append(game.Rounds, currentRound)
		} else {
			game.Rounds[roundIndex] = currentRound
		}

		// Check if game is completed (early win or all rounds played)
		neededWins := (game.MaxRounds / 2) + 1
		p0Score := game.Players[0].Score
		p1Score := game.Players[1].Score

		if p0Score >= neededWins || p1Score >= neededWins {
			// Early win: someone clinched
			game.Status = "finished"
			if p0Score >= neededWins {
				game.WinnerID = game.Players[0].UserID
				game.WinnerName = game.Players[0].Nickname
			} else {
				game.WinnerID = game.Players[1].UserID
				game.WinnerName = game.Players[1].Nickname
			}
			updateGameMessageStatus(ctx, game, "finished", game.WinnerName)
		} else if game.CurrentRound >= game.MaxRounds {
			if game.RequireDecisiveWin && p0Score == p1Score {
				// Tied after all rounds and decisive win required -> add extra round
				game.MaxRounds++
				game.CurrentRound++
			} else {
				// Game ends normally
				game.Status = "finished"
				winnerID, winnerName := determineGameWinner(game.Players)
				game.WinnerID = winnerID
				game.WinnerName = winnerName
				updateGameMessageStatus(ctx, game, "finished", winnerName)
			}
		} else {
			// Advance to next round
			game.CurrentRound++
		}
	} else {
		// Just save the move for this player
		if roundIndex == -1 {
			game.Rounds = append(game.Rounds, currentRound)
		} else {
			game.Rounds[roundIndex] = currentRound
		}
	}

	game.UpdatedAt = time.Now()

	// Update DB
	_, err = db.MongoDB.Collection("games").UpdateOne(ctx, bson.M{"_id": gameID}, bson.M{
		"$set": bson.M{
			"players":       game.Players,
			"rounds":        game.Rounds,
			"status":        game.Status,
			"current_round": game.CurrentRound,
			"winner_id":     game.WinnerID,
			"winner_name":   game.WinnerName,
			"updated_at":    game.UpdatedAt,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record move"})
		return
	}

	// Broadcast game update to participants
	broadcastGameUpdate(ctx, game)

	c.JSON(http.StatusOK, game)
}

// Helper to determine round winner
func determineRoundWinner(gameType string, p1, p2 string, moves map[string]interface{}) string {
	move1 := moves[p1]
	move2 := moves[p2]

	if gameType == "rps" {
		m1, _ := move1.(string)
		m2, _ := move2.(string)

		if m1 == m2 {
			return "draw"
		}
		if (m1 == "rock" && m2 == "scissors") || (m1 == "scissors" && m2 == "paper") || (m1 == "paper" && m2 == "rock") {
			return p1
		}
		return p2
	} else if gameType == "dice" {
		// For dice, higher score wins. Move value is numeric.
		v1 := getIntValue(move1)
		v2 := getIntValue(move2)

		if v1 == v2 {
			return "draw"
		}
		if v1 > v2 {
			return p1
		}
		return p2
	}
	return "draw"
}

func getIntValue(val interface{}) int {
	switch v := val.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	}
	return 0
}

// Helper to determine game winner based on scores
func determineGameWinner(players []models.GamePlayer) (string, string) {
	if players[0].Score == players[1].Score {
		return "draw", "平局"
	}
	if players[0].Score > players[1].Score {
		return players[0].UserID, players[0].Nickname
	}
	return players[1].UserID, players[1].Nickname
}

// Helper to broadcast game updates to all participants in chat
func broadcastGameUpdate(ctx context.Context, game models.Game) {
	wsMsg := WSMessage{
		Event: "game_update",
		Data:  game,
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	// In group chats, broadcast to group members, otherwise to the two private chat partners
	var targets []string
	if game.IsGroup {
		groupID, _ := primitive.ObjectIDFromHex(game.ChatID)
		var group models.Group
		err := db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
		if err == nil {
			for _, m := range group.Members {
				targets = append(targets, m.Hex())
			}
		}
	} else {
		// Private chat participants
		targets = append(targets, game.CreatorID, game.ChatID)
	}

	for _, target := range targets {
		db.RedisClient.Publish(ctx, "user_messages:"+target, wsMsgBytes)
	}
}

// Helper to update the original game card message content in DB and notify frontend
func updateGameMessageStatus(ctx context.Context, game models.Game, status string, winnerName string) {
	msgID, err := primitive.ObjectIDFromHex(game.MessageID)
	if err != nil {
		return
	}

	gameCardContent := map[string]interface{}{
		"type":         "game_card",
		"game_id":      game.ID.Hex(),
		"game_type":    game.Type,
		"status":       status,
		"creator_id":   game.CreatorID,
		"creator_name": game.CreatorName,
		"winner_name":  winnerName,
	}
	gameCardBytes, _ := json.Marshal(gameCardContent)

	_, err = db.MongoDB.Collection("messages").UpdateOne(ctx, bson.M{"_id": msgID}, bson.M{
		"$set": bson.M{
			"content": string(gameCardBytes),
		},
	})
	if err != nil {
		log.Printf("Failed to update game message card status: %v", err)
		return
	}

	// Fetch updated message to broadcast Edit event
	var msg models.Message
	err = db.MongoDB.Collection("messages").FindOne(ctx, bson.M{"_id": msgID}).Decode(&msg)
	if err != nil {
		return
	}

	// Broadcast edit event so UI updates instantly
	wsMsg := WSMessage{
		Event: "message_edit",
		Data: gin.H{
			"message_id": game.MessageID,
			"content":    msg.Content,
		},
	}
	wsMsgBytes, _ := json.Marshal(wsMsg)

	var targets []string
	if game.IsGroup {
		groupID, _ := primitive.ObjectIDFromHex(game.ChatID)
		var group models.Group
		err = db.MongoDB.Collection("groups").FindOne(ctx, bson.M{"_id": groupID}).Decode(&group)
		if err == nil {
			for _, m := range group.Members {
				targets = append(targets, m.Hex())
			}
		}
	} else {
		targets = append(targets, game.CreatorID, game.ChatID)
	}

	for _, target := range targets {
		db.RedisClient.Publish(ctx, "user_messages:"+target, wsMsgBytes)
	}
}
