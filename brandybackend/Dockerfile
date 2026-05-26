# Build stage
FROM golang:alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Run stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/main .

# Expose port
EXPOSE 8081

# Run the app
CMD ["./main"]
