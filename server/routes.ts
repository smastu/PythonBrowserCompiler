import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { log } from "./vite";

// Collaborative editing session interfaces
interface CollaborationSession {
  users: {
    id: string;
    name: string;
    cursor: { line: number; ch: number };
    color: string;
  }[];
  code: string;
  // チャットメッセージの履歴を保存
  chatMessages: {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: number;
  }[];
}

// Store collaborative sessions
const sessions: Record<string, CollaborationSession> = {};

// Generate random session ID
function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Generate random color for users
function generateColor(): string {
  const colors = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A8", 
    "#33FFF5", "#F5FF33", "#FF8333", "#33FFB5",
    "#B533FF", "#FF33B5"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Create WebSocket server on a separate path to avoid conflicts with Vite's HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // API routes (prefix with /api)
  // Create new collaboration session
  app.post("/api/sessions", (req, res) => {
    const sessionId = generateSessionId();
    sessions[sessionId] = {
      users: [],
      code: req.body.initialCode || '',
      chatMessages: [] // チャットメッセージの配列を初期化
    };
    log(`Created new session: ${sessionId}`, "routes");
    res.json({ sessionId });
  });

  // Get session information
  app.get("/api/sessions/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    if (sessions[sessionId]) {
      res.json({
        sessionId,
        userCount: sessions[sessionId].users.length
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // WebSocket connection handler
  wss.on('connection', function connection(ws) {
    let sessionId = '';
    let userId = '';
    let pingTimeout: NodeJS.Timeout | null = null;
    
    log("WebSocket connection established", "routes");
    
    // Set up ping interval to keep connection alive
    function heartbeat() {
      // Clear previous timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
      }
      
      // Set a timeout to terminate connection if no pong is received
      pingTimeout = setTimeout(() => {
        log(`Terminating stale connection for ${userId} in session ${sessionId}`, "routes");
        (ws as any).terminate();
      }, 30000); // 30 seconds timeout
    }
    
    // Start the heartbeat
    heartbeat();
    
    // Handle pong responses
    ws.on('pong', heartbeat);
    
    // Set up interval to send pings
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.ping();
      }
    }, 25000); // Send ping every 25 seconds

    ws.on('message', function incoming(message) {
      try {
        const data = JSON.parse(message.toString());
        log(`Received message: ${data.type}`, "routes");

        // Handle different message types
        console.log(`Received ${data.type} message from ${data.userId || "unknown"} for session ${data.sessionId || "new"}`);
        
        switch (data.type) {
          case 'ping':
            // Simple ping-pong to test WebSocket connectivity
            try {
              ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now()
              }));
              log(`Sent pong response to ${data.userId} in session ${data.sessionId}`, "routes");
            } catch (err) {
              log(`Error sending pong: ${err}`, "routes");
            }
            break;
            
          case 'join':
            // Join or create a session
            sessionId = data.sessionId || generateSessionId();
            userId = data.userId || `user-${Date.now()}`;
            const userName = data.userName || `User ${Math.floor(Math.random() * 1000)}`;
            
            log(`User ${userName} joining session ${sessionId}`, "routes");
            
            // Store session and user IDs on the WebSocket object for proper client identification
            (ws as any).sessionId = sessionId;
            (ws as any).userId = userId;
            
            // Initialize session if it doesn't exist
            if (!sessions[sessionId]) {
              sessions[sessionId] = {
                users: [],
                code: data.initialCode || '',
                chatMessages: [] // チャットメッセージの配列を初期化
              };
              log(`Created new session: ${sessionId}`, "routes");
            }

            // Check if user already exists in session
            const existingUserIndex = sessions[sessionId].users.findIndex(u => u.id === userId);
            const userColor = generateColor();
            
            if (existingUserIndex >= 0) {
              // Update existing user
              sessions[sessionId].users[existingUserIndex] = {
                ...sessions[sessionId].users[existingUserIndex],
                name: userName,
              };
              log(`User ${userName} reconnected to session ${sessionId}`, "routes");
            } else {
              // Add new user to session
              sessions[sessionId].users.push({
                id: userId,
                name: userName,
                cursor: { line: 0, ch: 0 },
                color: userColor
              });
              log(`User ${userName} added to session ${sessionId}`, "routes");
            }

            // Send session info back to the user
            ws.send(JSON.stringify({
              type: 'joined',
              sessionId,
              userId,
              users: sessions[sessionId].users,
              code: sessions[sessionId].code,
              color: userColor,
              chatMessages: sessions[sessionId].chatMessages // チャット履歴も送信
            }));

            // Notify other users about the new user
            broadcastToSession(sessionId, {
              type: 'user-joined',
              userId,
              name: userName,
              color: userColor
            }, userId);
            break;

          case 'code-change':
            // Log the incoming code-change event
            log(`Received code-change from ${data.userId} for session ${data.sessionId || (ws as any).sessionId}`, "routes");
            console.log(`CODE CHANGE RECEIVED: from ${data.userId} for session ${data.sessionId || (ws as any).sessionId}`);
            
            // Determine sessionId to use, with fallbacks
            let sessionToUse = (ws as any).sessionId || data.sessionId;
            let userIdToUse = (ws as any).userId || data.userId;
            
            // More detailed logging
            console.log('Code change details:', {
              sessionToUse,
              userIdToUse,
              wsSessionId: (ws as any).sessionId,
              dataSessionId: data.sessionId,
              codeLength: data.code?.length || 0,
              sessionExists: sessionToUse ? !!sessions[sessionToUse] : false
            });
            
            // We need a valid session ID one way or another
            if (!sessionToUse || !sessions[sessionToUse]) {
              const errorMsg = `Cannot process code change: invalid session ID ${sessionToUse}`;
              log(errorMsg, "routes");
              console.error(errorMsg);
              
              // Try to send error back to client
              try {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Session not found or invalid. Please refresh and try again.'
                }));
              } catch (err) {
                console.error('Error sending error message:', err);
              }
              break;
            }
            
            // We need a valid user ID
            if (!userIdToUse) {
              log(`Missing userId for code-change in session ${sessionToUse}`, "routes");
              break;
            }
            
            // Store the session and user IDs on the WebSocket object if not already set
            // This ensures future messages can be properly associated
            if (!(ws as any).sessionId && sessionToUse) {
              (ws as any).sessionId = sessionToUse;
              log(`Updated WebSocket with sessionId ${sessionToUse}`, "routes");
            }
            
            if (!(ws as any).userId && userIdToUse) {
              (ws as any).userId = userIdToUse;
              log(`Updated WebSocket with userId ${userIdToUse}`, "routes");
            }
            
            // Always update code in the session
            sessions[sessionToUse].code = data.code;
            log(`Updated code in session ${sessionToUse} (${data.code.length} chars)`, "routes");
            
            // Create message object with all needed information
            const codeUpdateMsg = {
              type: 'code-update',
              code: data.code,
              userId: userIdToUse,
              timestamp: data.timestamp || Date.now()
            };
            
            // Broadcast to all users in session except sender
            log(`Broadcasting code-update to session ${sessionToUse} (${data.code.length} chars)`, "routes");
            console.log(`BROADCASTING CODE UPDATE: to session ${sessionToUse} (${data.code.length} chars)`);
            
            // Using our improved broadcastToSession function
            broadcastToSession(sessionToUse, codeUpdateMsg, userIdToUse);
            break;

          case 'cursor-move':
            // Update cursor position and broadcast to all users
            // Use the same improved pattern from code-change
            
            // Determine sessionId to use, with fallbacks
            const cursorSessionId = (ws as any).sessionId || data.sessionId;
            const cursorUserId = (ws as any).userId || data.userId;
            
            // Skip if no valid session/user
            if (!cursorSessionId || !sessions[cursorSessionId] || !cursorUserId) {
              // Silently fail for cursor moves to avoid console spam
              break;
            }
            
            // Update sessionId and userId on WebSocket if not set
            if (!(ws as any).sessionId) {
              (ws as any).sessionId = cursorSessionId;
            }
            if (!(ws as any).userId) {
              (ws as any).userId = cursorUserId;
            }
            
            // Find user in session
            const sessionForCursor = sessions[cursorSessionId];
            const user = sessionForCursor.users.find(u => u.id === cursorUserId);
            
            if (user) {
              // Only update if the cursor actually moved to reduce traffic
              if (user.cursor.line !== data.cursor.line || user.cursor.ch !== data.cursor.ch) {
                // Update cursor in user record
                user.cursor = data.cursor;
                
                // Send to all other users in session
                broadcastToSession(cursorSessionId, {
                  type: 'cursor-update',
                  userId: cursorUserId,
                  cursor: data.cursor,
                  timestamp: data.timestamp || Date.now()
                }, cursorUserId);
              }
            } else {
              // User not found in session, could be a registration issue
              // Add them to the users array if they're not there
              const newUser = {
                id: cursorUserId,
                name: data.userName || `User ${cursorUserId.split('-')[1] || 'Unknown'}`,
                cursor: data.cursor,
                color: data.color || generateColor()
              };
              
              sessionForCursor.users.push(newUser);
              log(`Added missing user ${cursorUserId} to session ${cursorSessionId}`, "routes");
              
              // Broadcast the cursor position
              broadcastToSession(cursorSessionId, {
                type: 'cursor-update',
                userId: cursorUserId,
                cursor: data.cursor
              }, cursorUserId);
            }
            break;

          case 'chat-message':
            // チャットメッセージの処理
            const chatSessionId = (ws as any).sessionId || data.sessionId;
            const chatUserId = (ws as any).userId || data.userId;
            const chatUserName = data.userName || "Unknown User";
            
            if (!chatSessionId || !sessions[chatSessionId] || !chatUserId) {
              // 有効なセッションまたはユーザーでない場合は処理しない
              log(`Invalid session or user for chat message: ${chatSessionId}, ${chatUserId}`, "routes");
              break;
            }
            
            // メッセージデータを作成
            const chatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
              userId: chatUserId,
              userName: chatUserName,
              message: data.message,
              timestamp: Date.now()
            };
            
            // セッションにメッセージを保存
            sessions[chatSessionId].chatMessages.push(chatMessage);
            log(`Chat message from ${chatUserName} in session ${chatSessionId}: ${data.message.substring(0, 30)}${data.message.length > 30 ? '...' : ''}`, "routes");
            
            // 全ユーザーにメッセージを送信
            broadcastToSession(chatSessionId, {
              type: 'chat-message',
              message: chatMessage
            });
            break;
        }
      } catch (e) {
        log(`Error handling WebSocket message: ${e}`, "routes");
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    ws.on('close', function() {
      // Clear the heartbeat interval and timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }
      clearInterval(pingInterval);
      
      // Use the stored session ID from the WebSocket object if available
      const wsSessionId = (ws as any).sessionId || sessionId;
      const wsUserId = (ws as any).userId || userId;
      
      if (wsSessionId && sessions[wsSessionId]) {
        log(`User ${wsUserId} disconnected from session ${wsSessionId}`, "routes");
        
        // Remove user from session
        sessions[wsSessionId].users = sessions[wsSessionId].users.filter(u => u.id !== wsUserId);
        
        // Notify other users
        broadcastToSession(wsSessionId, {
          type: 'user-left',
          userId: wsUserId
        });
        
        // Clean up empty sessions
        if (sessions[wsSessionId].users.length === 0) {
          log(`Cleaning up empty session: ${wsSessionId}`, "routes");
          delete sessions[wsSessionId];
        }
      }
      log("WebSocket connection closed", "routes");
    });

    // Function to broadcast message to all users in a session except the sender
    function broadcastToSession(sessionId: string, message: any, excludeUserId?: string) {
      // Stop early if session is invalid
      if (!sessionId || !sessions[sessionId]) {
        log(`Cannot broadcast to invalid session: ${sessionId}`, "routes");
        return;
      }
      
      // Keep track of which clients belong to which session
      const sessionUsers = sessions[sessionId].users || [];
      if (sessionUsers.length === 0 && excludeUserId) {
        log(`Warning: Trying to broadcast to empty session ${sessionId}`, "routes");
        // But we'll continue anyway in case clients haven't registered their user IDs yet
      }
      
      // Log for debugging - especially critical for code updates since they need to reach all clients
      const isCriticalEvent = message.type === 'code-update';
      const isFrequentEvent = message.type === 'cursor-update';
      
      // Enhanced logging for debugging
      if (isCriticalEvent) {
        // ALWAYS log details for code updates - these are critical for debugging
        console.log(`BROADCASTING CODE UPDATE to session ${sessionId} (${sessionUsers.length} users)`);
        log(`Broadcasting ${message.type} (${message.code?.length || 0} chars) to ${sessionUsers.length} users in session ${sessionId}`, "routes");
      } else if (!isFrequentEvent) {
        // Log other non-frequent events
        log(`Broadcasting ${message.type} to ${sessionUsers.length} users in session ${sessionId}`, "routes");
      }
      
      // Use two approaches for finding clients to maximize broadcast success:
      
      // 1. Direct lookup by sessionId property on WebSocket objects
      const targetClients = Array.from(wss.clients)
        .filter((client: any) => 
          client.readyState === WebSocket.OPEN && 
          client.sessionId === sessionId && 
          client.userId !== excludeUserId
        );
      
      // 2. Additional check for clients that might be connected but with unset properties
      // Convert to array once
      const allClients = Array.from(wss.clients);
      
      // Find the sender client if we have an excludeUserId
      const senderClient = excludeUserId ? 
        allClients.find((c: any) => c.userId === excludeUserId) : 
        null;
      
      // Now filter for possible unregistered clients
      const possibleClients = allClients.filter((client: any) => 
        client.readyState === WebSocket.OPEN && 
        !client.sessionId && // Clients that haven't fully registered
        client !== senderClient // Don't send to the sender
      );
      
      // If no primary target clients found and this is a critical event, try to broadcast to all possible clients
      if (isCriticalEvent && targetClients.length === 0 && possibleClients.length > 0) {
        log(`WARNING: No identified clients for session ${sessionId}, but found ${possibleClients.length} possible clients. Attempting broadcast to all.`, "routes");
      }
      
      const clientsToUse = targetClients.length > 0 ? targetClients : (isCriticalEvent ? possibleClients : []);
      
      // If there are no clients to send to, early return
      if (clientsToUse.length === 0) {
        log(`No active clients to send ${message.type} to in session ${sessionId}`, "routes");
        return;
      }
      
      // Serialize the message once for all clients
      const messageStr = JSON.stringify(message);
      let sentCount = 0;
      let errorCount = 0;
      
      // Send to all filtered clients with detailed logging
      clientsToUse.forEach((client: any) => {
        try {
          client.send(messageStr);
          sentCount++;
          
          // Log only for important events or if verbose logging is needed
          if (isCriticalEvent) {
            log(`Sent code-update to user ${client.userId || "unknown"} in session ${client.sessionId || "unknown"}`, "routes");
          }
        } catch (err) {
          errorCount++;
          log(`Error sending to client ${client.userId || "unknown"}: ${err}`, "routes");
        }
      });
      
      // Always log the result of code updates
      if (isCriticalEvent) {
        console.log(`CODE UPDATE RESULTS: sent to ${sentCount}/${clientsToUse.length} clients, errors: ${errorCount}`);
        log(`Code update results: sent to ${sentCount}/${clientsToUse.length} users, errors: ${errorCount}`, "routes");
      } else if (!isFrequentEvent) {
        // Log summary for infrequent events
        log(`Successfully sent to ${sentCount} users`, "routes");
      }
    }
  });

  return httpServer;
}
