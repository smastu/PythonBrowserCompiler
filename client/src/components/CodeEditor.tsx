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
  lastInput: { line: number; ch: number };
  inputPosition: { line: number; ch: number };
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
  const [currentPosition, setCurrentPosition] = useState({ line: 1, column: 1 });
  const { toast } = useToast();

  // URLパラメータからセッションIDを取得
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam && !isCollaborating && !userName) {  // 名前が未設定の場合のみダイアログを表示
      console.log('Guest detected - Found session ID in URL:', sessionParam);
      setSessionId(sessionParam);
      setDialogOpen(true);
    }
  }, []); // 初回のみ実行

  // チャットメッセージを処理する関数
  const handleNewChatMessage = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message]);
  };

  // Update editor content when code prop changes externally
  // Track if the change is from collaboration
  const isExternalUpdate = useRef(false);
  const lastCursorPosition = useRef({ line: 1, column: 1 });
  const isFirstUpdate = useRef(true);

  useEffect(() => {
    // Only update if the editor exists and has different content
    if (aceEditorRef.current && aceEditorRef.current.getValue() !== code) {
      console.log('External code update detected');

      // Store current cursor position before update
      const currentPos = aceEditorRef.current.getCursorPosition();
      const currentPosition = {
        line: currentPos.row + 1,
        column: currentPos.column + 1
      };

      // Set flag to avoid triggering the local change event
      isExternalUpdate.current = true;
      // Update editor content
      aceEditorRef.current.setValue(code, -1);

      // Only restore cursor position if it's not the first update
      if (!isFirstUpdate.current) {
        console.log('Restoring cursor position:', currentPosition);
        aceEditorRef.current.gotoLine(currentPosition.line, currentPosition.column - 1);
        setCurrentPosition(currentPosition);
      } else {
        isFirstUpdate.current = false;
      }

      // Clear selection to avoid visual issues
      aceEditorRef.current.clearSelection();
      // Reset flag after a short delay to allow setValue to complete
      setTimeout(() => {
        isExternalUpdate.current = false;
      }, 50);
    }
  }, [code]);

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

    // カーソル位置の変更を監視
    editor.selection.on('changeCursor', () => {
      const position = editor.getCursorPosition();
      const newPosition = {
        line: position.row + 1,  // 1-based line number
        column: position.column + 1  // 1-based column number
      };
      console.log('Current cursor position:', newPosition);
      setCurrentPosition(newPosition);
      lastCursorPosition.current = newPosition;
    });

    // コード変更のデバウンス用タイマー
    let codeChangeTimeout: NodeJS.Timeout | null = null;

    // Handle changes with debounce to avoid overwhelming the server
    editor.session.on("change", (delta: any) => {
      console.log('Editor change detected:', {
        delta,
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

      // 入力位置を送信
      if (isCollaborating && userId && sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          const position = editor.getCursorPosition();
          const inputMessage = {
            type: 'input-position',
            sessionId,
            userId,
            userName,
            position: {
              line: position.row,
              ch: position.column
            }
          };
          console.log('Sending input position:', inputMessage);
          wsRef.current.send(JSON.stringify(inputMessage));
        } catch (err) {
          console.error('Error sending input position:', err);
        }
      }

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
  };

  // Update cursor markers when collaboration users change
  useEffect(() => {
    if (isCollaborating && aceEditorRef.current) {
      console.log('Updating collaborator cursors:', collaborationUsers);
      updateCollaboratorCursors();
    }
  }, [collaborationUsers, isCollaborating]);

  // WebSocket connection for collaboration
  const connectToCollaborationSession = (sessionToJoin?: string, initialUserName?: string) => {
    console.log('Connecting to collaboration session:', { sessionToJoin, initialUserName });

    // Close existing connection if any
    if (wsRef.current) {
      try {
        console.log('Closing existing WebSocket connection');
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
        setIsCollaborating(false);
        setDialogOpen(false);
      }
    }, 5000);

    ws.onopen = () => {
      console.log("WebSocket connected successfully");
      clearTimeout(connectionTimeout);

      // Immediately set as collaborating - CRITICAL FLAG FOR SENDING UPDATES
      setIsCollaborating(true);

      // Generate a random user name if none provided
      const generatedUserName = initialUserName || userName || `User ${Math.floor(Math.random() * 1000)}`;
      setUserName(generatedUserName);

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
              isExternalUpdate.current = true;
              aceEditorRef.current?.setValue(message.code, -1);
              aceEditorRef.current?.clearSelection();
              setCode(message.code);
              setTimeout(() => {
                isExternalUpdate.current = false;
              }, 100);
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
            setCollaborationUsers(prev => {
              const newUsers = [
                ...prev,
                {
                  id: message.userId,
                  name: message.name,
                  cursor: { line: 0, ch: 0 },
                  color: message.color,
                  lastInput: { line: 0, ch: 0 },
                  inputPosition: { line: 0, ch: 0 }
                }
              ];
              console.log('Updated users after join:', newUsers);
              return newUsers;
            });
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
                const updatedUsers = prev.map(u => {
                  if (u.id === message.userId) {
                    return {
                      ...u,
                      inputPosition: {
                        line: message.cursor.line,
                        ch: message.cursor.ch
                      },
                      name: message.userName || u.name
                    };
                  }
                  return u;
                });
                console.log('Updated collaboration users:', updatedUsers);
                return updatedUsers;
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

          case 'last-input':
            // Update last input position for a user
            if (message.userId !== userId) {
              console.log('Updating last input position for user:', message.userId, message.position);
              setCollaborationUsers(prev => {
                const updatedUsers = prev.map(u => {
                  if (u.id === message.userId) {
                    return {
                      ...u,
                      lastInput: {
                        line: message.position.line,
                        ch: message.position.ch
                      },
                      name: message.userName || u.name
                    };
                  }
                  return u;
                });
                console.log('Updated collaboration users:', updatedUsers);
                return updatedUsers;
              });
            }
            break;

          case 'input-position':
            // Update input position for a user
            if (message.userId !== userId) {
              console.log('Updating input position for user:', message.userId, message.position);
              setCollaborationUsers(prev => {
                const updatedUsers = prev.map(u => {
                  if (u.id === message.userId) {
                    return {
                      ...u,
                      inputPosition: {
                        line: message.position.line,
                        ch: message.position.ch
                      },
                      name: message.userName || u.name
                    };
                  }
                  return u;
                });
                console.log('Updated collaboration users:', updatedUsers);
                return updatedUsers;
              });
            }
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
        setDialogOpen(false); // 接続が切れた時はダイアログを閉じる
      }
    };
  };

  // Start collaboration session
  const startCollaboration = () => {
    console.log('Starting new collaboration session');

    // 新規セッションを作成
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setIsCollaborating(true);

    // WebSocket接続を開始
    connectToCollaborationSession(newSessionId, userName);
    setDialogOpen(false); // 接続成功時にダイアログを閉じる

    // 共有ダイアログを表示
    setShowShareDialog(true);
  };

  // Join existing session
  const joinSession = (sessionIdToJoin: string) => {
    console.log('Joining existing session:', sessionIdToJoin);

    if (!sessionIdToJoin) {
      console.error('Invalid session ID');
      toast({
        title: "Error",
        description: "Please enter a valid session ID",
        variant: "destructive",
      });
      return;
    }

    if (!userName.trim()) {
      console.error('No username provided');
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);

    try {
      // WebSocket接続を開始
      connectToCollaborationSession(sessionIdToJoin, userName);
      setDialogOpen(false); // 接続成功時にダイアログを閉じる
    } catch (error) {
      console.error('Error joining session:', error);
      toast({
        title: "Error",
        description: "Failed to join session. Please try again.",
        variant: "destructive",
      });
      setIsCollaborating(false);
    } finally {
      setIsJoining(false);
    }
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

  // Show share dialog with session info
  const showSessionInfo = () => {
    console.log('Showing session info:', { sessionId, isCollaborating });
    if (sessionId && isCollaborating) {
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
    if (!sessionId) {
      console.error('No session ID available');
      return;
    }

    const sessionLink = `${window.location.origin}?session=${sessionId}`;
    console.log('Copying session link:', sessionLink);

    navigator.clipboard.writeText(sessionLink)
      .then(() => {
        toast({
          title: "Link Copied",
          description: "Collaboration link copied to clipboard",
          variant: "default",
        });
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
        toast({
          title: "Error",
          description: "Failed to copy link to clipboard",
          variant: "destructive",
        });
      });
  };

  // Stop collaboration
  const stopCollaboration = () => {
    console.log('Stopping collaboration');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsCollaborating(false);
    setCollaborationUsers([]);
    setSessionId("");
    setUserId("");
    setShowShareDialog(false);

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
              onClick={() => {
                console.log('Collaborate button clicked');
                setDialogOpen(true);
              }}
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

      {/* Current Position Display */}
      <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
        <div className="text-sm text-gray-600">
          <div className="font-medium">Current Position:</div>
          <div className="flex items-center space-x-2">
            <span>Line {currentPosition.line}, Column {currentPosition.column}</span>
          </div>
        </div>
      </div>

      {/* Input Position Display */}
      {isCollaborating && collaborationUsers.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <div className="text-sm text-gray-600">
            <div className="font-medium mb-1">Collaborator Positions:</div>
            <div className="grid grid-cols-2 gap-2">
              {collaborationUsers.map(user => (
                <div key={user.id} className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: user.color }}
                  ></div>
                  <span className="font-medium">{user.name}:</span>
                  <span>
                    {user.id === userId ?
                      `Line ${currentPosition.line}, Column ${currentPosition.column}` :
                      user.inputPosition ?
                        `Line ${user.inputPosition.line + 1}, Column ${user.inputPosition.ch + 1}` :
                        'No input yet'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          // ゲストの場合（sessionIdが存在する場合）は、名前入力が完了するまでダイアログを閉じない
          if (sessionId && !userName.trim()) {
            return;
          }
          setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sessionId ? 'Join Collaboration Session' : 'Start Collaboration'}
            </DialogTitle>
            <DialogDescription>
              {sessionId
                ? 'Please enter your name to join the collaboration session.'
                : 'Please enter your name to start collaborating.'}
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
                onChange={(e) => {
                  console.log('Username input changed:', e.target.value);
                  setUserName(e.target.value);
                }}
                className="col-span-3"
                placeholder="Enter your name"
                required
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                if (!userName.trim()) {
                  alert("Please enter your name");
                  return;
                }

                if (sessionId) {
                  // ゲストとして参加
                  joinSession(sessionId);
                } else {
                  // ホストとして新規セッション開始
                  startCollaboration();
                }
              }}
              disabled={!userName.trim()}
            >
              {sessionId ? 'Join Session' : 'Start Collaboration'}
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
                    if (sessionId) {
                      navigator.clipboard.writeText(sessionId)
                        .then(() => {
                          toast({
                            title: "Copied",
                            description: "Session ID copied to clipboard",
                          });
                        })
                        .catch((err) => {
                          console.error('Failed to copy session ID:', err);
                          toast({
                            title: "Error",
                            description: "Failed to copy session ID",
                            variant: "destructive",
                          });
                        });
                    }
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
