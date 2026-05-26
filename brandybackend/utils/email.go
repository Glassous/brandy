package utils

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"os"
	"strings"
)

// SendEmail sends a verification email to the recipient with Brandy-style HTML template
func SendEmail(to, actionText, code string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")

	if host == "" || port == "" || user == "" || pass == "" {
		return fmt.Errorf("SMTP environment variables are not fully configured")
	}

	addr := fmt.Sprintf("%s:%s", host, port)

	// Use {{ACTION}} and {{CODE}} as placeholders to avoid fmt.Sprintf misinterpreting
	// CSS percentage values (e.g. 0%, 100% in gradients) as format verbs.
	const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Brandy 验证码</title>
  <style>
    body {
      background-color: #F9F6F0;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1A1A1A;
    }
    .container {
      max-width: 500px;
      margin: 40px auto;
      background-color: #FFFFFF;
      border: 1px solid #E5DFD0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(44, 95, 138, 0.04);
    }
    .header {
      background: linear-gradient(135deg, #2C5F8A 0%, #3B7FB8 100%);
      padding: 24px 20px;
      text-align: center;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .logo-span {
      color: #D4B87A;
    }
    .content {
      padding: 35px 30px;
      line-height: 1.6;
    }
    .greeting {
      font-size: 16px;
      font-weight: 700;
      color: #2C5F8A;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .text {
      font-size: 14px;
      color: #5C5A55;
      margin-bottom: 24px;
    }
    .code-container {
      background-color: #F9F6F0;
      border: 1px dashed #D4B87A;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .code-title {
      font-size: 12px;
      font-weight: 600;
      color: #5C5A55;
      letter-spacing: 1px;
      margin: 0 0 8px 0;
    }
    .code-number {
      font-size: 28px;
      font-weight: 800;
      color: #2C5F8A;
      letter-spacing: 4px;
      margin: 0;
    }
    .footer {
      background-color: #F9F6F0;
      border-top: 1px solid #E5DFD0;
      padding: 16px 20px;
      text-align: center;
      font-size: 11px;
      color: #9E9685;
    }
    .footer-text {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo">Brandy<span class="logo-span"> Cloud</span></h1>
    </div>
    <div class="content">
      <h2 class="greeting">您好！</h2>
      <p class="text">您正在进行 <strong>{{ACTION}}</strong> 操作。请在验证窗口中输入以下验证码：</p>
      <div class="code-container">
        <p class="code-title">电子邮箱验证码</p>
        <p class="code-number">{{CODE}}</p>
      </div>
      <p class="text" style="margin-bottom: 0;">此验证码在 <strong>10 分钟</strong> 内有效。为保障您的账号安全，请勿将验证码泄露给他人。</p>
    </div>
    <div class="footer">
      <p class="footer-text">这是一封系统自动发送的邮件，请勿直接回复。</p>
      <p class="footer-text">© 2026 Brandy Cloud. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

	body := strings.ReplaceAll(htmlTemplate, "{{ACTION}}", actionText)
	body = strings.ReplaceAll(body, "{{CODE}}", code)

	// Set up headers
	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = fmt.Sprintf("【Brandy】%s验证码: %s", actionText, code)
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	message := ""
	for k, v := range headers {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body

	auth := smtp.PlainAuth("", user, pass, host)

	// Since QQ Mail SMTP port 465 requires SSL, we use tls.Dial
	if port == "465" {
		tlsconfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         host,
		}

		conn, err := tls.Dial("tcp", addr, tlsconfig)
		if err != nil {
			return fmt.Errorf("failed to dial tls: %w", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("failed to create smtp client: %w", err)
		}
		defer client.Close()

		// Auth
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("failed to authenticate: %w", err)
		}

		// To && From
		if err = client.Mail(user); err != nil {
			return fmt.Errorf("failed to set sender: %w", err)
		}
		if err = client.Rcpt(to); err != nil {
			return fmt.Errorf("failed to set recipient: %w", err)
		}

		// Data
		w, err := client.Data()
		if err != nil {
			return fmt.Errorf("failed to get data writer: %w", err)
		}
		_, err = w.Write([]byte(message))
		if err != nil {
			return fmt.Errorf("failed to write message: %w", err)
		}
		err = w.Close()
		if err != nil {
			return fmt.Errorf("failed to close data writer: %w", err)
		}

		return client.Quit()
	} else {
		// Standard smtp.SendMail for other ports (e.g. 587, 25)
		return smtp.SendMail(addr, auth, user, []string{to}, []byte(message))
	}
}
