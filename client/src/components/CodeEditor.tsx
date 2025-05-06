import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import ChatWindow from "./ChatWindow";

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  onClear: () => void;
  onCursorChange?: (position: { line: number; column: number }) => void;
  remoteCursors?: Array<{
    userId: string;
    userName: string;
    position: { line: number; column: number };
  }>;
}

// Exposed methods for parent components
export interface CodeEditorHandle {
  joinSession: (sessionId: string) => void;
}

interface CollaborationUser {
  id: string;
  name: string;
  cursor: { line: number; ch: number };
  color: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

declare global {
  interface Window {
    ace: any;
  }
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({ code, setCode, onClear, onCursorChange, remoteCursors = [] }, ref) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const aceEditorRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationUsers, setCollaborationUsers] = useState<CollaborationUser[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userColor, setUserColor] = useState<string>("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [userName, setUserName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const { toast } = useToast();
  
  // チャットメッセージを処理する関数
  const handleNewChatMessage = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message]);
  };
  
  // Initialize Ace Editor
  useEffect(() => {
    if (!editorContainerRef.current) return;

    // Make sure Ace is available
    if (!window.ace) {
      console.error("Ace editor not loaded!");
      return;
    }

    // Initialize the editor
    const editor = window.ace.edit(editorContainerRef.current);
    aceEditorRef.current = editor;
    
    // Configure editor
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/python");
    editor.setFontSize(14);
    editor.setShowPrintMargin(true);
    
    // Enable advanced features
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
      showLineNumbers: true,
      tabSize: 4
    });
    
    // Set initial value
    editor.setValue(code, -1);
    
    // コード変更のデバウンス用タイマー
    let codeChangeTimeout: NodeJS.Timeout | null = null;
    
    // カーソル位置の変更を監視
    editor.selection.on('changeCursor', () => {
      if (isExternalUpdate.current) return;
      
      const position = editor.getCursorPosition();
      console.log('Cursor position changed:', position);
      
      if (isCollaborating && userId && sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'cursor-move',
            sessionId,
            userId,
            userName,
            cursor: { line: position.row, ch: position.column }
          }));
        } catch (err) {
          console.error('Error sending cursor position:', err);
        }
      }
    });

    // キー入力イベントを監視
    editor.on('input', () => {
      if (isExternalUpdate.current) return;
      
      const position = editor.getCursorPosition();
      console.log('Input event - cursor position:', position);
      
      if (isCollaborating && userId && sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'cursor-move',
            sessionId,
            userId,
            userName,
            cursor: { line: position.row, ch: position.column }
          }));
        } catch (err) {
          console.error('Error sending cursor position after input:', err);
        }
      }
    });

    // マウスクリックイベントを監視
    editor.on('click', () => {
      if (isExternalUpdate.current) return;
      
      const position = editor.getCursorPosition();
      console.log('Click event - cursor position:', position);
      
      if (isCollaborating && userId && sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'cursor-move',
            sessionId,
            userId,
            userName,
            cursor: { line: position.row, ch: position.column }
          }));
        } catch (err) {
          console.error('Error sending cursor position after click:', err);
        }
      }
    });
    
    // Handle changes with debounce to avoid overwhelming the server
    editor.session.on("change", (delta: any) => {
      console.log('Editor change detected:', { 
        lines: delta.lines, 
        isCollaborating, 
        isExternalUpdate: isExternalUpdate.current, 
        wsReadyState: wsRef.current?.readyState 
      });
      
      // Skip if this change was triggered by an external update
      if (isExternalUpdate.current) {
        console.log('Ignoring change event from external update');
        return;
      }
      
      const newCode = editor.getValue();
      setCode(newCode);
      
      // Check both React state and DOM attribute for collaboration status
      const editorElement = document.querySelector('.ace-editor-container');
      const domCollaborating = editorElement?.getAttribute('data-collaborating') === 'true';
      const domSessionId = editorElement?.getAttribute('data-session');
      const domUserId = editorElement?.getAttribute('data-user');
      
      // Effective collaboration state - use either React state or DOM backup
      const effectivelyCollaborating = isCollaborating || domCollaborating;
      const effectiveSessionId = sessionId || domSessionId;
      const effectiveUserId = userId || domUserId;
      
      // Clear previous timeout if it exists
      if (codeChangeTimeout) {
        clearTimeout(codeChangeTimeout);
      }
      
      // Always verify WebSocket connection is active
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected. Reconnecting...');
        if (effectiveSessionId) {
          connectToCollaborationSession(effectiveSessionId, userName);
        }
      }
      
      // If collaborating (using either React state or DOM backup), send code changes
      if ((effectivelyCollaborating && effectiveUserId && effectiveSessionId) || 
          (wsRef.current?.readyState === WebSocket.OPEN && domSessionId)) {
        
        // Debounce code changes to send a maximum of once per 20ms for better responsiveness
        codeChangeTimeout = setTimeout(() => {
          // Log for debugging
          console.log(`Sending code update: ${newCode.length} chars to session ${effectiveSessionId}`);
          
          // Double-check connection is still open before sending
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try {
              // Prepare message with all required fields
              const message = JSON.stringify({
                type: 'code-change',
                sessionId: effectiveSessionId,
                userId: effectiveUserId,
                code: newCode,
                timestamp: Date.now()
              });
              
              wsRef.current.send(message);
              console.log(`Code update sent successfully: ${newCode.length} chars to session ${effectiveSessionId}`);
            } catch (err) {
              console.error('Error sending code update:', err);
              toast({
                title: "Sync Error",
                description: "Failed to sync your changes. Reconnecting...",
                variant: "destructive",
              });
              
              // Auto-reconnect on error
              try {
                if (effectiveSessionId) {
                  connectToCollaborationSession(effectiveSessionId, userName || '');
                }
              } catch (e) {
                console.error('Error reconnecting after send failure:', e);
              }
            }
          }
        }, 20);
      }
    });
    
    // Cleanup
    return () => {
      editor.destroy();
      aceEditorRef.current = null;
    };
  }, []);

  // Generate markers for other users' cursors
  const updateCollaboratorCursors = () => {
    if (!aceEditorRef.current) return;
    
    // Clear existing markers
    const session = aceEditorRef.current.getSession();
    const prevMarkers = session.getMarkers();
    if (prevMarkers) {
      const markerIds = Object.keys(prevMarkers);
      markerIds.forEach(id => {
        if (prevMarkers[id].clazz?.includes('collaboration-cursor')) {
          session.removeMarker(parseInt(id));
        }
      });
    }
    
    // Add markers for each collaborator
    collaborationUsers.forEach(user => {
      if (user.id !== userId) {
        const range = new (window as any).ace.Range(
          user.cursor.line, 
          user.cursor.ch, 
          user.cursor.line, 
          user.cursor.ch + 1
        );
        
        // Create marker
        session.addMarker(range, `collaboration-cursor-${user.id}`, "text", true);
        
        // Add CSS rule for this user's cursor
        const styleId = `collaboration-style-${user.id}`;
        let styleEl = document.getElementById(styleId) as HTMLStyleElement;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }
        
        // より目立つカーソルスタイル
        styleEl.textContent = `
          @keyframes blink-${user.id} {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
          }
          
          .ace_marker-layer .collaboration-cursor-${user.id} {
            position: absolute;
            background-color: ${user.color};
            z-index: 9999;
            width: 4px !important;
            pointer-events: none;
            animation: blink-${user.id} 0.8s infinite;
            box-shadow: 0 0 8px ${user.color}, 0 0 12px ${user.color};
            border-radius: 2px;
          }
          
          .ace_marker-layer .collaboration-cursor-${user.id}::before {
            content: '${user.name}';
            position: absolute;
            top: -24px;
            left: 0px;
            background-color: ${user.color};
            color: white;
            padding: 3px 8px;
            font-size: 13px;
            font-weight: bold;
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            animation: blink-${user.id} 0.8s infinite;
            z-index: 9999;
          }
          
          .ace_marker-layer .collaboration-cursor-${user.id}::after {
            content: '';
            position: absolute;
            top: -4px;
            left: -4px;
            right: -4px;
            bottom: -4px;
            background-color: ${user.color};
            opacity: 0.1;
            border-radius: 4px;
            z-index: -1;
          }
        `;
      }
    });
  };

  // Update cursor markers when collaboration users change
  useEffect(() => {
    if (isCollaborating && aceEditorRef.current) {
      console.log('Updating collaborator cursors:', collaborationUsers);
      updateCollaboratorCursors();
    }
  }, [collaborationUsers, isCollaborating]);
  
  // Update editor content when code prop changes externally
  // Track if the change is from collaboration
  const isExternalUpdate = useRef(false);
  
  useEffect(() => {
    // Only update if the editor exists and has different content
    if (aceEditorRef.current && aceEditorRef.current.getValue() !== code) {
      console.log('External code update detected');
      // Set flag to avoid triggering the local change event
      isExternalUpdate.current = true;
      // Update editor content
      aceEditorRef.current.setValue(code, -1);
      // Clear selection to avoid visual issues
      aceEditorRef.current.clearSelection();
      // Reset flag after a short delay to allow setValue to complete
      setTimeout(() => {
        isExternalUpdate.current = false;
      }, 50);
    }
  }, [code]);
  
  // WebSocket connection for collaboration
  const connectToCollaborationSession = (sessionToJoin?: string, initialUserName?: string) => {
    console.log('Connecting to collaboration session:', { sessionToJoin, initialUserName });
    
    // Close existing connection if any
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        console.error('Error closing existing WebSocket:', e);
      }
      wsRef.current = null;
    }
    
    // Setup WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log(`Connecting to WebSocket at ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    // Set a timeout to check if connection succeeds
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection timeout');
        toast({
          title: "Connection Failed",
          description: "Could not connect to collaboration server. Please try again.",
          variant: "destructive",
        });
      }
    }, 5000);
    
    ws.onopen = () => {
      console.log("WebSocket connected successfully");
      clearTimeout(connectionTimeout);
      
      // Immediately set as collaborating - CRITICAL FLAG FOR SENDING UPDATES
      setIsCollaborating(true);
      
      // Generate a random user name if none provided
      const generatedUserName = initialUserName || userName || `User ${Math.floor(Math.random() * 1000)}`;
      
      // Keep a copy of current session ID
      if (sessionToJoin) {
        setSessionId(sessionToJoin);
      }
      
      // Explicitly force the collaborating state change by adding some direct DOM data
      try {
        const editorElement = document.querySelector('.ace-editor-container');
        if (editorElement) {
          editorElement.setAttribute('data-collaborating', 'true');
          editorElement.setAttribute('data-session', sessionToJoin || 'new-session');
        }
      } catch (e) {
        console.error('Failed to mark editor as collaborating:', e);
      }
      
      // Join existing session or create new one
      const joinMessage = {
        type: 'join',
        sessionId: sessionToJoin,
        userName: generatedUserName,
        initialCode: aceEditorRef.current?.getValue() || code
      };
      
      console.log('Sending join message:', joinMessage);
      ws.send(JSON.stringify(joinMessage));
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received WebSocket message:', message);
        
        switch (message.type) {
          case 'joined':
            // Successfully joined session
            console.log('Joined collaboration session:', message);
            setSessionId(message.sessionId);
            setUserId(message.userId);
            setUserColor(message.color);
            setCollaborationUsers(message.users);
            
            // チャットメッセージの履歴を設定
            if (message.chatMessages && Array.isArray(message.chatMessages)) {
              console.log(`Received ${message.chatMessages.length} chat messages from session`);
              setChatMessages(message.chatMessages);
            }
            
            // CRITICAL: Force collaboration mode flag to true
            setIsCollaborating(true);
            
            // Add direct DOM flag as backup
            try {
              const editorElement = document.querySelector('.ace-editor-container');
              if (editorElement) {
                editorElement.setAttribute('data-collaborating', 'true');
                editorElement.setAttribute('data-session', message.sessionId);
                editorElement.setAttribute('data-user', message.userId);
              }
            } catch (e) {
              console.error('Failed to mark editor as collaborating:', e);
            }
            
            // Set code from session if joining existing session
            if (message.code && message.code !== aceEditorRef.current?.getValue()) {
              console.log(`Setting editor content from session: ${message.code.length} chars`);
              aceEditorRef.current?.setValue(message.code, -1);
              setCode(message.code);
            }
            
            // Add a small delay and check collaboration state to ensure it's properly set
            setTimeout(() => {
              if (!isCollaborating) {
                console.warn('Collaboration flag not set after join message, forcing it now');
                setIsCollaborating(true);
              }
            }, 500);
            
            toast({
              title: "Collaboration Session Active",
              description: `Session ID: ${message.sessionId}`,
            });
            break;
            
          case 'user-joined':
            // Add new user to the list
            setCollaborationUsers(prev => [
              ...prev, 
              { 
                id: message.userId, 
                name: message.name, 
                cursor: { line: 0, ch: 0 }, 
                color: message.color 
              }
            ]);
            toast({
              title: "User Joined",
              description: `${message.name} joined the session`,
              variant: "default",
            });
            break;
            
          case 'user-left':
            // Remove user from the list
            setCollaborationUsers(prev => prev.filter(u => u.id !== message.userId));
            break;
            
          case 'code-update':
            // Update code from other user
            if (message.userId !== userId) {
              console.log(`Received code update from user ${message.userId}`);
              // Set flag to prevent triggering local change event
              isExternalUpdate.current = true;
              // Force code update regardless of current value to ensure synchronization
              if (aceEditorRef.current) {
                console.log(`Updating editor with code from user ${message.userId} (${message.code.length} chars)`);
                aceEditorRef.current.setValue(message.code, -1);
                aceEditorRef.current.clearSelection();
                setCode(message.code);
              } else {
                console.warn('Editor reference is null when trying to update code');
              }
              // Reset flag after a delay
              setTimeout(() => {
                isExternalUpdate.current = false;
              }, 100);
            }
            break;
            
          case 'cursor-update':
            // Update cursor position for a user
            if (message.userId !== userId) {
              console.log('Updating cursor for user:', message.userId, message.cursor);
              setCollaborationUsers(prev => {
                return prev.map(u => {
                  if (u.id === message.userId) {
                    return { 
                      ...u, 
                      cursor: message.cursor,
                      name: message.userName || u.name
                    };
                  }
                  return u;
                });
              });
            }
            break;
            
          case 'user-update':
            // Update user name
            if (message.userId !== userId) {
              console.log('Updating name for user:', message.userId, message.newName);
              setCollaborationUsers(prev => {
                return prev.map(u => {
                  if (u.id === message.userId) {
                    return { ...u, name: message.newName };
                  }
                  return u;
                });
              });
            }
            break;
            
          case 'chat-message':
            // チャットメッセージを受け取り、表示する
            console.log(`Received chat message: ${message.message.message}`);
            handleNewChatMessage(message.message);
            break;
            
          case 'error':
            toast({
              title: "Error",
              description: message.message,
              variant: "destructive",
            });
            break;
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error", error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to collaboration server",
        variant: "destructive",
      });
      setIsCollaborating(false);
    };
    
    ws.onclose = () => {
      console.log("WebSocket connection closed");
      if (isCollaborating) {
        toast({
          title: "Disconnected",
          description: "Collaboration session ended",
          variant: "default",
        });
        setIsCollaborating(false);
        setCollaborationUsers([]);
        setSessionId("");
        setUserId("");
      }
    };
  };
  
  // Start collaboration session
  const startCollaboration = () => {
    // 既存のセッションに参加する場合は、ユーザー名を保持
    if (sessionId) {
      joinSession(sessionId);
    } else {
      setDialogOpen(true);
    }
  };
  
  // Join existing session
  const joinSession = (sessionIdToJoin: string) => {
    if (!sessionIdToJoin) {
      toast({
        title: "Error",
        description: "Please enter a valid session ID",
        variant: "destructive",
      });
      return;
    }
    
    // Set state before actual connection
    setIsJoining(true);
    
    // Set collaboration flag early to ensure state is updated
    setIsCollaborating(true);
    setSessionId(sessionIdToJoin);
    
    // Apply direct DOM attribute for extra reliability
    try {
      const editorElement = document.querySelector('.ace-editor-container');
      if (editorElement) {
        editorElement.setAttribute('data-collaborating', 'true');
        editorElement.setAttribute('data-session', sessionIdToJoin);
      }
    } catch (e) {
      console.error('Failed to mark editor as collaborating:', e);
    }
    
    // Now connect
    connectToCollaborationSession(sessionIdToJoin, userName || `User ${Math.floor(Math.random() * 1000)}`);
    setDialogOpen(false);
    setIsJoining(false);
  };
  
  // Generate a random session ID
  const generateSessionId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 8;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Create new session
  const createNewSession = () => {
    setIsJoining(true);
    
    // Generate a random session ID
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    
    // Set collaboration flag early to ensure state is updated
    setIsCollaborating(true);
    
    // Apply direct DOM attribute for extra reliability
    try {
      const editorElement = document.querySelector('.ace-editor-container');
      if (editorElement) {
        editorElement.setAttribute('data-collaborating', 'true');
        editorElement.setAttribute('data-session', newSessionId);
      }
    } catch (e) {
      console.error('Failed to mark editor as collaborating:', e);
    }
    
    connectToCollaborationSession(newSessionId, userName);
    setDialogOpen(false);
    setIsJoining(false);
  };
  
  // Show share dialog with session info
  const showSessionInfo = () => {
    if (sessionId) {
      setShowShareDialog(true);
    } else {
      toast({
        title: "Not Collaborating",
        description: "Start a collaboration session first",
        variant: "default",
      });
    }
  };
  
  // Copy session link to clipboard
  const copySessionLink = () => {
    const sessionLink = `${window.location.origin}?session=${sessionId}`;
    navigator.clipboard.writeText(sessionLink);
    toast({
      title: "Link Copied",
      description: "Collaboration link copied to clipboard",
      variant: "default",
    });
  };
  
  // Stop collaboration
  const stopCollaboration = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsCollaborating(false);
    setCollaborationUsers([]);
    setSessionId("");
    setUserId("");
    
    toast({
      title: "Collaboration Ended",
      description: "You've left the collaboration session",
      variant: "default",
    });
  };
  
  // Expose methods to parent component through ref
  useImperativeHandle(ref, () => ({
    joinSession: (sessionIdToJoin: string) => {
      if (sessionIdToJoin) {
        connectToCollaborationSession(sessionIdToJoin, userName || `User ${Math.floor(Math.random() * 1000)}`);
      }
    }
  }));

  // ユーザー名変更ダイアログの状態
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newUserName, setNewUserName] = useState(userName);

  // ユーザー名変更処理
  const handleNameChange = () => {
    if (!newUserName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid name",
        variant: "destructive",
      });
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'name-change',
          sessionId,
          userId,
          newName: newUserName
        }));
        setUserName(newUserName);
        setShowNameDialog(false);
        toast({
          title: "Name Updated",
          description: "Your display name has been updated",
        });
      } catch (err) {
        console.error('Error updating name:', err);
        toast({
          title: "Error",
          description: "Failed to update name. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="bg-white rounded-md shadow-sm border border-gray-300 ace-editor-container" style={{ minWidth: '100%', width: '100%' }}>
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h3 className="font-medium text-gray-700">Python Code Editor</h3>
        <div className="flex space-x-2">
          {isCollaborating ? (
            <>
              <div className="flex items-center mr-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>
                <span className="text-xs text-gray-600">
                  {collaborationUsers.length} {collaborationUsers.length === 1 ? 'user' : 'users'}
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="text-blue-600"
                onClick={() => setShowNameDialog(true)}
              >
                <i className="ri-user-settings-line mr-1"></i> Change Name
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-blue-600"
                onClick={showSessionInfo}
              >
                <i className="ri-share-line mr-1"></i> Share
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-red-600"
                onClick={stopCollaboration}
              >
                <i className="ri-close-line mr-1"></i> End
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              className="text-blue-600"
              onClick={startCollaboration}
            >
              <i className="ri-team-line mr-1"></i> Collaborate
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-gray-500 hover:text-gray-700"
            onClick={onClear}
          >
            <i className="ri-delete-bin-line"></i>
          </Button>
        </div>
      </div>
      
      {isCollaborating && collaborationUsers.length > 0 && (
        <div className="border-b border-gray-200 px-4 py-1 bg-gray-50 flex items-center overflow-x-auto">
          <span className="text-xs text-gray-500 mr-2">Collaborators:</span>
          <div className="flex space-x-2">
            {collaborationUsers.map(user => (
              <span 
                key={user.id} 
                className="text-xs rounded-full px-2 py-0.5 text-white" 
                style={{ 
                  backgroundColor: user.id === userId ? userColor : user.color,
                  border: user.id === userId ? '1px solid rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {user.name} {user.id === userId && '(you)'}
              </span>
            ))}
          </div>
        </div>
      )}
      
      <div className="relative w-full">
        <div 
          ref={editorContainerRef}
          className="ace-editor-container relative" 
          style={{ height: '512px', width: '100%', fontSize: '14px' }}
        ></div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-center cursor-row-resize h-4 bg-gray-200 hover:bg-gray-300 border-t border-gray-300" 
          onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = editorContainerRef.current?.offsetHeight || 800;
            
            const onMouseMove = (moveEvent: MouseEvent) => {
              if (editorContainerRef.current) {
                const newHeight = startHeight + (moveEvent.clientY - startY);
                // 最小高さを300pxに制限
                if (newHeight >= 300) {
                  editorContainerRef.current.style.height = `${newHeight}px`;
                }
              }
            };
            
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        >
          <div className="w-10 h-1 bg-gray-400 rounded-full my-1.5"></div>
        </div>
      </div>
      
      {/* Chat window */}
      <ChatWindow
        messages={chatMessages}
        isCollaborating={isCollaborating}
        sessionId={sessionId}
        userId={userId}
        userName={userName || "Anonymous"}
        wsRef={wsRef}
        onNewMessage={handleNewChatMessage}
      />
      
      {/* Start Collaboration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Collaboration</DialogTitle>
            <DialogDescription>
              Start a new collaboration session or join an existing one.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Your Name
              </Label>
              <Input
                id="name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="col-span-3"
                placeholder="Enter your display name"
              />
            </div>
          </div>
          
          <DialogFooter className="flex space-x-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => sessionId ? joinSession(sessionId) : createNewSession()}
              disabled={isJoining}
            >
              {isJoining ? "Connecting..." : (sessionId ? "Join Session" : "Create New Session")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Share Session Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Collaboration Session</DialogTitle>
            <DialogDescription>
              Share this session ID or link with others to collaborate.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="share-id" className="text-right">
                Session ID
              </Label>
              <div className="col-span-3 flex">
                <Input
                  id="share-id"
                  value={sessionId}
                  readOnly
                  className="rounded-r-none"
                />
                <Button
                  className="rounded-l-none"
                  onClick={() => {
                    navigator.clipboard.writeText(sessionId);
                    toast({
                      title: "Copied",
                      description: "Session ID copied to clipboard",
                    });
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="share-link" className="text-right">
                Session Link
              </Label>
              <div className="col-span-3 flex">
                <Input
                  id="share-link"
                  value={`${window.location.origin}?session=${sessionId}`}
                  readOnly
                  className="rounded-r-none"
                />
                <Button
                  className="rounded-l-none"
                  onClick={copySessionLink}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ユーザー名変更ダイアログ */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Display Name</DialogTitle>
            <DialogDescription>
              Enter your new display name for this collaboration session.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-name" className="text-right">
                New Name
              </Label>
              <Input
                id="new-name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="col-span-3"
                placeholder="Enter your new display name"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleNameChange}>
              Update Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default CodeEditor;
