package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"brandybackend/db"
	"brandybackend/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type OpenAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIRequest struct {
	Model           string          `json:"model"`
	Messages        []OpenAIMessage `json:"messages"`
	MaxTokens       int             `json:"max_tokens,omitempty"`
	Temperature     float64         `json:"temperature,omitempty"`
}

type OpenAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func CallOpenAI(ctx context.Context, messages []OpenAIMessage) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY not configured")
	}

	baseURL := os.Getenv("OPENAI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	model := os.Getenv("OPENAI_MODEL")
	if model == "" {
		model = "gpt-4o-mini"
	}

	req := OpenAIRequest{
		Model:       model,
		Messages:    messages,
		MaxTokens:   300,
		Temperature: 0.7,
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %v", err)
	}

	log.Printf("[OpenAI] Request URL: %s/chat/completions", baseURL)
	log.Printf("[OpenAI] Request Body: %s", string(reqBody))

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to call OpenAI API: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %v", err)
	}

	log.Printf("[OpenAI] Response Status: %d", resp.StatusCode)
	log.Printf("[OpenAI] Response Body: %s", string(body))

	var openaiResp OpenAIResponse
	if err := json.Unmarshal(body, &openaiResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal response: %v, body: %s", err, string(body))
	}

	if openaiResp.Error != nil {
		return "", fmt.Errorf("OpenAI API error: %s", openaiResp.Error.Message)
	}

	if len(openaiResp.Choices) == 0 {
		return "", fmt.Errorf("no choices in response, body: %s", string(body))
	}

	return strings.TrimSpace(openaiResp.Choices[0].Message.Content), nil
}

func BuildAISystemPrompt(aiName string, personality string) string {
	prompt := fmt.Sprintf(`你是一个群聊中的AI助手，名字叫"%s"。

规则：
1. 保持简短回复，每次回复不超过100字
2. 语气自然友好，像朋友一样聊天
3. 不要重复用户的问题
4. 如果没有特别的信息需要补充，可以简单回应
5. 不要暴露自己是AI，表现得像一个普通群成员
6. 回复要简洁，不要使用markdown格式`, aiName)

	if personality != "" {
		prompt += fmt.Sprintf("\n\n你的性格特点：%s", personality)
	}

	return prompt
}

func GetRecentGroupMessages(ctx context.Context, groupID primitive.ObjectID, limit int64) []models.Message {
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetLimit(limit)

	cursor, err := db.MongoDB.Collection("messages").Find(ctx, bson.M{"group_id": groupID}, opts)
	if err != nil {
		log.Printf("Failed to fetch recent messages: %v", err)
		return nil
	}
	defer cursor.Close(ctx)

	var messages []models.Message
	if err := cursor.All(ctx, &messages); err != nil {
		log.Printf("Failed to decode messages: %v", err)
		return nil
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages
}

func BuildChatMessages(aiName string, personality string, messages []models.Message, senderName string, userMessage string, aiUserID primitive.ObjectID) []OpenAIMessage {
	chatMessages := []OpenAIMessage{
		{
			Role:    "system",
			Content: BuildAISystemPrompt(aiName, personality),
		},
	}

	for _, msg := range messages {
		// Skip file messages, only include text
		if strings.HasPrefix(msg.Content, "{") {
			continue
		}

		role := "user"
		if msg.SenderID == aiUserID {
			role = "assistant"
		}

		content := msg.Content
		if role == "user" {
			// For user messages, we could add sender name, but keep it simple
			content = msg.Content
		}

		chatMessages = append(chatMessages, OpenAIMessage{
			Role:    role,
			Content: content,
		})
	}

	chatMessages = append(chatMessages, OpenAIMessage{
		Role:    "user",
		Content: userMessage,
	})

	return chatMessages
}
