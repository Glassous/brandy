import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../shared/Toast';
import { API_BASE } from '../../config';
import { CloseIcon } from '../shared/Icons';
import { Avatar } from '../shared/Avatar';

interface GamePlayer {
  user_id: string;
  nickname: string;
  avatar: string;
  score: number;
}

interface GameRound {
  round_num: number;
  moves: Record<string, any>;
  winner_id: string;
}

interface Game {
  id: string;
  type: 'rps' | 'dice';
  chat_id: string;
  is_group: boolean;
  creator_id: string;
  creator_name: string;
  status: 'pending' | 'active' | 'finished';
  players: GamePlayer[];
  rounds: GameRound[];
  max_rounds: number;
  current_round: number;
  winner_id: string;
  winner_name: string;
  require_decisive_win: boolean;
}

interface GameRoomModalProps {
  gameId: string;
  onClose: () => void;
}

export default function GameRoomModal({ gameId, onClose }: GameRoomModalProps) {
  const { token, user } = useApp();
  const { showToast } = useToast();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Dice rolling animation state
  const [isRolling, setIsRolling] = useState(false);
  const [rollingVal, setRollingVal] = useState(1);

  // Track which rounds have had their reveal animation triggered
  const [revealedRounds, setRevealedRounds] = useState<Set<number>>(new Set());

  const fetchGameDetails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/games/${gameId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGame(data);
      } else {
        showToast('获取游戏信息失败', 'error');
      }
    } catch {
      showToast('网络错误，获取游戏失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGameDetails();

    // Listen to WS game updates
    const handleGameUpdate = (e: Event) => {
      const updatedGame = (e as CustomEvent).detail as Game;
      if (updatedGame.id === gameId) {
        setGame(updatedGame);
      }
    };

    window.addEventListener('brandy-game-update', handleGameUpdate);
    return () => {
      window.removeEventListener('brandy-game-update', handleGameUpdate);
    };
  }, [gameId]);

  // Watch game changes to trigger animations when both players have submitted moves
  useEffect(() => {
    if (!game || game.status !== 'active') return;

    const currentRoundObj = game.rounds.find(r => r.round_num === game.current_round);
    // If both players have moved and this round hasn't been revealed yet, trigger animation
    if (currentRoundObj && Object.keys(currentRoundObj.moves).length === 2 && !revealedRounds.has(game.current_round)) {
      setRevealedRounds(prev => new Set(prev).add(game.current_round));

      if (game.type === 'dice') {
        setIsRolling(true);
        let count = 0;
        const interval = setInterval(() => {
          setRollingVal(Math.floor(Math.random() * 6) + 1);
          count++;
          if (count > 10) {
            clearInterval(interval);
            setIsRolling(false);
          }
        }, 100);
      }
    }
  }, [game, revealedRounds]);

  const handleJoin = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGame(data);
        showToast('您已成功加入游戏房间！', 'success');
      } else {
        const errData = await res.json();
        showToast(errData.error || '加入失败', 'error');
      }
    } catch {
      showToast('网络错误，加入失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMove = async (moveVal: any) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/games/${gameId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ move: moveVal })
      });
      if (res.ok) {
        const data = await res.json();
        setGame(data);
      } else {
        const errData = await res.json();
        showToast(errData.error || '提交失败', 'error');
      }
    } catch {
      showToast('网络异常，请重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="game-overlay">
        <div className="game-card text-center" style={{ padding: '40px' }}>
          <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
          <div>加载房间信息中...</div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="game-overlay">
        <div className="game-card text-center">
          <div style={{ color: 'var(--badge-unread)', marginBottom: '16px' }}>游戏房间未找到或已损坏</div>
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  const isPlayer = game.players.some(p => p.user_id === user?.id);
  const player1 = game.players[0];
  const player2 = game.players[1] || null;

  const currentRoundObj = game.rounds.find(r => r.round_num === game.current_round);
  const userHasMoved = user ? (currentRoundObj?.moves && currentRoundObj.moves[user.id] !== undefined) : false;
  const userMoveValue = user && currentRoundObj?.moves ? currentRoundObj.moves[user.id] : null;
  const bothMoved = currentRoundObj ? Object.keys(currentRoundObj.moves).length === 2 : false;
  const completedRounds = game.rounds.filter(r => r.winner_id !== '');
  const lastCompletedRound = completedRounds.length > 0 ? completedRounds[completedRounds.length - 1] : null;
  const isExtraRound = game.current_round > game.max_rounds;

  // Dice helper mapping
  const getDiceEmoji = (num: number) => {
    const emojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return emojis[(num - 1) % 6] || '⚀';
  };

  const getRpsEmoji = (choice: string) => {
    switch (choice) {
      case 'rock': return '✊';
      case 'paper': return '✋';
      case 'scissors': return '✌️';
      default: return '❓';
    }
  };

  const getRpsName = (choice: string) => {
    switch (choice) {
      case 'rock': return '石头';
      case 'paper': return '布';
      case 'scissors': return '剪刀';
      default: return '未知';
    }
  };

  return (
    <div className="game-overlay">
      <style>{`
        .game-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3000;
          animation: fadeIn 0.25s ease-out;
        }
        .game-card {
          background: linear-gradient(135deg, var(--bg-card) 0%, rgba(20, 24, 33, 0.95) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          width: 500px;
          max-width: 92%;
          max-height: 85vh;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          color: var(--text);
          position: relative;
        }
        .game-close-btn {
          position: absolute;
          top: 18px;
          right: 18px;
          background: rgba(255,255,255,0.05);
          border: none;
          color: var(--text-dim);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
        }
        .game-close-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--text);
        }
        .game-title {
          font-size: 20px;
          font-weight: 800;
          text-align: center;
          margin-bottom: 24px;
          letter-spacing: 0.5px;
          color: var(--brand-blue);
          text-shadow: 0 2px 10px rgba(0, 122, 255, 0.25);
        }
        .versus-section {
          display: flex;
          align-items: center;
          justify-content: space-around;
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.04);
        }
        .player-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 140px;
          gap: 8px;
        }
        .player-score {
          font-size: 28px;
          font-weight: 800;
          color: var(--brand-yellow);
          font-family: 'Outfit', sans-serif;
        }
        .vs-divider {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-dim);
          font-style: italic;
        }
        .game-status-banner {
          text-align: center;
          padding: 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 20px;
        }
        .action-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
        }
        .rps-btn-group {
          display: flex;
          gap: 16px;
        }
        .game-action-btn {
          font-size: 32px;
          width: 72px;
          height: 72px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .game-action-btn:hover:not(:disabled) {
          transform: scale(1.12);
          background: var(--brand-blue);
          border-color: transparent;
          box-shadow: 0 8px 20px rgba(0, 122, 255, 0.4);
        }
        .game-action-btn:active:not(:disabled) {
          transform: scale(0.95);
        }
        .dice-display {
          font-size: 84px;
          line-height: 1;
          color: var(--brand-blue);
          text-shadow: 0 4px 20px rgba(0, 122, 255, 0.3);
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dice-roll-btn {
          padding: 12px 36px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 14px;
          border: none;
          background: var(--brand-blue);
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3);
        }
        .dice-roll-btn:hover:not(:disabled) {
          background: #2b98ff;
          box-shadow: 0 6px 20px rgba(0, 122, 255, 0.4);
        }
        .dice-roll-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .rolling {
          animation: diceShake 0.4s infinite alternate;
        }
        @keyframes diceShake {
          from { transform: rotate(-15deg); }
          to { transform: rotate(15deg); }
        }
        .reveal-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
          width: 100%;
        }
        .reveal-row {
          display: flex;
          justify-content: space-around;
          width: 100%;
          align-items: center;
        }
        .reveal-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .reveal-choice {
          font-size: 40px;
        }
        .round-result-announce {
          font-size: 16px;
          font-weight: 700;
          color: var(--brand-yellow);
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
          font-size: 12.5px;
        }
        .history-table th {
          text-align: left;
          padding: 8px;
          border-bottom: 2px solid rgba(255,255,255,0.06);
          color: var(--text-dim);
          font-weight: 600;
        }
        .history-table td {
          padding: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .winner-crown {
          text-align: center;
          font-size: 48px;
          margin-bottom: 12px;
          animation: bounce 1s infinite alternate;
        }
        @keyframes bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-10px); }
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: var(--brand-blue);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="game-card" onClick={e => e.stopPropagation()}>
        <button className="game-close-btn" onClick={onClose}><CloseIcon size={18} /></button>
        <div className="game-title">
          {game.type === 'rps' ? '猜拳对战室' : '骰子点数室'}
        </div>

        {/* Players Area */}
        <div className="versus-section">
          <div className="player-box">
            <Avatar name={player1.nickname} url={player1.avatar} size={48} />
            <span style={{ fontSize: '13px', fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player1.nickname}</span>
            <span className="player-score">{player1.score}</span>
          </div>

          <div className="vs-divider">VS</div>

          <div className="player-box">
            {player2 ? (
              <>
                <Avatar name={player2.nickname} url={player2.avatar} size={48} />
                <span style={{ fontSize: '13px', fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player2.nickname}</span>
                <span className="player-score">{player2.score}</span>
              </>
            ) : (
              <>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: 'var(--text-dim)' }}>?</div>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>等待挑战者...</span>
                <span className="player-score">0</span>
              </>
            )}
          </div>
        </div>

        {/* Game State Flow */}
        {game.status === 'pending' && (
          <div className="action-pane">
            <div className="game-status-banner">游戏正在等待挑战者加入。</div>
            {!isPlayer && player2 === null && (
              <button className="btn btn-primary" onClick={handleJoin} disabled={submitting} style={{ padding: '10px 24px', borderRadius: '12px' }}>
                {submitting ? '加入中...' : '加入对战'}
              </button>
            )}
            {isPlayer && <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>等待另一位玩家加入以开始对战...</div>}
          </div>
        )}

        {game.status === 'active' && (
          <>
            <div className="game-status-banner">
              {isExtraRound
                ? `加赛轮 第 ${game.current_round} 轮`
                : `当前轮次: 第 ${game.current_round} / ${game.max_rounds} 轮`
              }
            </div>

            {/* Completed round result — persists until next round completes */}
            {!bothMoved && lastCompletedRound && (
              <div className="reveal-pane" style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                  第 {lastCompletedRound.round_num} 轮结果
                </div>
                <div className="reveal-row">
                  <div className="reveal-box">
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{player1.nickname}</span>
                    <span className="reveal-choice" style={{ fontSize: '32px' }}>
                      {game.type === 'rps' ? getRpsEmoji(lastCompletedRound.moves[player1.user_id]) : getDiceEmoji(lastCompletedRound.moves[player1.user_id])}
                    </span>
                    {game.type === 'rps' && <span style={{ fontSize: '11px' }}>{getRpsName(lastCompletedRound.moves[player1.user_id])}</span>}
                    {game.type === 'dice' && <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{lastCompletedRound.moves[player1.user_id]} 点</span>}
                  </div>
                  <div style={{ fontSize: '20px', color: 'var(--text-dim)' }}>⚡</div>
                  <div className="reveal-box">
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{player2?.nickname}</span>
                    <span className="reveal-choice" style={{ fontSize: '32px' }}>
                      {game.type === 'rps' ? getRpsEmoji(lastCompletedRound.moves[player2?.user_id || '']) : getDiceEmoji(lastCompletedRound.moves[player2?.user_id || ''])}
                    </span>
                    {game.type === 'rps' && <span style={{ fontSize: '11px' }}>{getRpsName(lastCompletedRound.moves[player2?.user_id || ''])}</span>}
                    {game.type === 'dice' && <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{lastCompletedRound.moves[player2?.user_id || '']} 点</span>}
                  </div>
                </div>
                <div className="round-result-announce" style={{ fontSize: '14px' }}>
                  {lastCompletedRound.winner_id === 'draw' ? (
                    '🤝 平局！'
                  ) : (
                    `${game.players.find(p => p.user_id === lastCompletedRound.winner_id)?.nickname} 赢下本轮`
                  )}
                </div>
              </div>
            )}

            {/* Current round: both moved → reveal + result */}
            {bothMoved && currentRoundObj ? (
              <div className="reveal-pane">
                <div className="reveal-row">
                  <div className="reveal-box">
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{player1.nickname}</span>
                    <span className="reveal-choice">
                      {game.type === 'rps' ? getRpsEmoji(currentRoundObj.moves[player1.user_id]) : getDiceEmoji(currentRoundObj.moves[player1.user_id])}
                    </span>
                    {game.type === 'rps' && <span style={{ fontSize: '12px' }}>{getRpsName(currentRoundObj.moves[player1.user_id])}</span>}
                    {game.type === 'dice' && <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{currentRoundObj.moves[player1.user_id]} 点</span>}
                  </div>
                  <div style={{ fontSize: '24px' }}>⚡</div>
                  <div className="reveal-box">
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{player2?.nickname}</span>
                    <span className="reveal-choice">
                      {game.type === 'rps' ? getRpsEmoji(currentRoundObj.moves[player2?.user_id || '']) : getDiceEmoji(currentRoundObj.moves[player2?.user_id || ''])}
                    </span>
                    {game.type === 'rps' && <span style={{ fontSize: '12px' }}>{getRpsName(currentRoundObj.moves[player2?.user_id || ''])}</span>}
                    {game.type === 'dice' && <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{currentRoundObj.moves[player2?.user_id || '']} 点</span>}
                  </div>
                </div>
                <div className="round-result-announce">
                  {currentRoundObj.winner_id === 'draw' ? (
                    '🤝 本轮平局！'
                  ) : (
                    `🎉 ${game.players.find(p => p.user_id === currentRoundObj.winner_id)?.nickname} 赢下了本轮！`
                  )}
                </div>
              </div>
            ) : isRolling ? (
              <div className="action-pane">
                <div className={`dice-display rolling`}>{getDiceEmoji(rollingVal)}</div>
                <div style={{ fontWeight: 600 }}>摇晃骰子中...</div>
              </div>
            ) : isPlayer ? (
              // Player Controls
              <div className="action-pane">
                {userHasMoved ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
                    {/* Show user's move while waiting for opponent */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>您的出招</span>
                      <span style={{ fontSize: '40px' }}>
                        {game.type === 'rps' ? getRpsEmoji(userMoveValue as string) : getDiceEmoji(userMoveValue as number)}
                      </span>
                      {game.type === 'rps' && <span style={{ fontSize: '13px', fontWeight: 600 }}>{getRpsName(userMoveValue as string)}</span>}
                      {game.type === 'dice' && <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{userMoveValue} 点</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)' }}>
                      <div className="spinner" style={{ width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '13px' }}>等待对手出招...</span>
                    </div>
                  </div>
                ) : game.type === 'rps' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>请做出您的选择：</span>
                    <div className="rps-btn-group">
                      <button className="game-action-btn" onClick={() => handleMove('rock')} disabled={submitting}>✊</button>
                      <button className="game-action-btn" onClick={() => handleMove('scissors')} disabled={submitting}>✌️</button>
                      <button className="game-action-btn" onClick={() => handleMove('paper')} disabled={submitting}>✋</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <div className="dice-display">🎲</div>
                    <button className="dice-roll-btn" onClick={() => handleMove(Math.floor(Math.random() * 6) + 1)} disabled={submitting}>
                      摇骰子
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', padding: '16px' }}>
                您正在观战，等待玩家出招...
              </div>
            )}

            {/* Persistent round history — always visible during active game */}
            {completedRounds.length > 0 && (
              <div style={{ width: '100%', marginTop: '16px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>历史轮次:</span>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>{player1.nickname}</th>
                      <th>{player2?.nickname}</th>
                      <th>胜者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRounds.map((r, idx) => (
                      <tr key={idx}>
                        <td>第 {r.round_num} 轮</td>
                        <td>
                          {game.type === 'rps' ? getRpsName(r.moves[player1.user_id]) + ' ' + getRpsEmoji(r.moves[player1.user_id]) : r.moves[player1.user_id] + ' 点'}
                        </td>
                        <td>
                          {player2 && (game.type === 'rps' ? getRpsName(r.moves[player2.user_id]) + ' ' + getRpsEmoji(r.moves[player2.user_id]) : r.moves[player2.user_id] + ' 点')}
                        </td>
                        <td style={{ fontWeight: 'bold', color: r.winner_id === 'draw' ? 'var(--text-dim)' : 'var(--brand-blue)' }}>
                          {r.winner_id === 'draw' ? '平局' : (game.players.find(p => p.user_id === r.winner_id)?.nickname || '未知')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {game.status === 'finished' && (
          <div className="action-pane" style={{ width: '100%' }}>
            <div className="winner-crown">👑</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--brand-yellow)', marginBottom: '8px' }}>
              {game.winner_id === 'draw' ? '两雄相争，终成平局！' : `恭喜 ${game.winner_name} 获得胜利！`}
            </div>

            <div style={{ width: '100%', marginTop: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>对局战报:</span>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>轮次</th>
                    <th>{player1.nickname}</th>
                    <th>{player2?.nickname}</th>
                    <th>本轮胜者</th>
                  </tr>
                </thead>
                <tbody>
                  {game.rounds.map((r, idx) => (
                    <tr key={idx}>
                      <td>第 {r.round_num} 轮</td>
                      <td>
                        {game.type === 'rps' ? getRpsName(r.moves[player1.user_id]) + ' ' + getRpsEmoji(r.moves[player1.user_id]) : r.moves[player1.user_id] + ' 点'}
                      </td>
                      <td>
                        {player2 && (game.type === 'rps' ? getRpsName(r.moves[player2.user_id]) + ' ' + getRpsEmoji(r.moves[player2.user_id]) : r.moves[player2.user_id] + ' 点')}
                      </td>
                      <td style={{ fontWeight: 'bold', color: r.winner_id === 'draw' ? 'var(--text-dim)' : 'var(--brand-blue)' }}>
                        {r.winner_id === 'draw' ? '平局' : (game.players.find(p => p.user_id === r.winner_id)?.nickname || '未知')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '20px', width: '100%' }}>
              返回聊天
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
