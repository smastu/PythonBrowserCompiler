import React, { useState, useEffect, useRef } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isCollaborating: boolean;
  sessionId: string;
  userId: string;
  userName: string;
  wsRef: React.RefObject<WebSocket>;
  onNewMessage: (message: ChatMessage) => void;
}

export default function ChatWindow({
  messages,
  isCollaborating,
  sessionId,
  userId,
  userName,
  wsRef,
  onNewMessage
}: ChatWindowProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [lastSeenMessageId, setLastSeenMessageId] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // スクロールを一番下に移動する関数
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    scrollToBottom();
    
    // 新規メッセージの処理
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      
      // チャットが開いていない場合は新規メッセージとしてマーク
      if (!isOpen && latestMessage.userId !== userId) {
        setNewMessageCount(prev => prev + 1);
        
        // 通知を表示
        toast({
          title: `新規メッセージ`,
          description: `${latestMessage.userName}さんからメッセージが届きました`,
          variant: "default"
        });
      } else if (isOpen) {
        // チャットが開いているときはカウントをリセット
        setNewMessageCount(0);
      }
      
      // 最後に見たメッセージIDを更新
      setLastSeenMessageId(latestMessage.id);
    }
  }, [messages, isOpen, userId, toast]);
  
  // チャットを開いたらカウントをリセット
  useEffect(() => {
    if (isOpen) {
      setNewMessageCount(0);
    }
  }, [isOpen]);

  // メッセージ送信処理
  const sendMessage = () => {
    if (!inputMessage.trim()) return;
    if (!isCollaborating) {
      toast({
        title: "Not Connected",
        description: "Please join a collaboration session first.",
        variant: "destructive"
      });
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'chat-message',
          sessionId,
          userId,
          userName,
          message: inputMessage
        }));
        setInputMessage('');
      } catch (err) {
        console.error('Error sending chat message:', err);
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Connection Lost",
        description: "WebSocket connection is closed. Please reconnect.",
        variant: "destructive"
      });
    }
  };

  // Enterキーでメッセージ送信
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    setInputMessage(prev => prev + emoji.native);
  };

  if (!isOpen && !isCollaborating) {
    return null; // 非表示
  }

  // チャットウィンドウを左下に固定表示する
  return (
    <Card className={`fixed bottom-4 left-4 shadow-lg transition-all duration-300 ${isOpen ? 'w-[350px] h-96' : 'w-[200px] h-12'} z-50`}>
      <CardHeader className="p-3 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium">Chat {isCollaborating ? `(Session: ${sessionId})` : ''}</CardTitle>
          <div className="flex items-center gap-2">
            {newMessageCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {newMessageCount} new
              </Badge>
            )}
            <Badge variant="outline">{messages.length}</Badge>
          </div>
        </div>
      </CardHeader>
      
      {isOpen && (
        <>
          <CardContent className="p-0">
            <ScrollArea className="h-64 p-3">
              {messages.length > 0 ? (
                <div className="space-y-3">
                  {messages.map((msg, index) => {
                    // 最後に見たメッセージID以降のメッセージは新規メッセージとして表示
                    const isNewMessage = lastSeenMessageId && msg.id !== lastSeenMessageId && 
                                        messages.findIndex(m => m.id === lastSeenMessageId) < messages.findIndex(m => m.id === msg.id);
                    
                    return (
                      <div key={msg.id} className={`flex flex-col ${msg.userId === userId ? 'items-end' : 'items-start'}`}>
                        <div 
                          className={`px-3 py-2 rounded-lg max-w-[85%] relative ${msg.userId === userId 
                            ? 'bg-primary text-primary-foreground'
                            : `bg-muted ${isNewMessage ? 'shadow-lg ring-2 ring-orange-400 dark:ring-orange-500' : ''}` 
                          }`}
                        >
                          {isNewMessage && msg.userId !== userId && (
                            <div className="absolute -left-1 -top-1 w-3 h-3 bg-orange-500 rounded-full animate-ping"></div>
                          )}
                          <div className="text-xs font-medium mb-1">
                            {msg.userId === userId ? 'You' : (
                              <span className={isNewMessage ? 'font-bold text-orange-600 dark:text-orange-400' : ''}>
                                {msg.userName}
                                {isNewMessage && ' (New)'}
                              </span>
                            )}
                          </div>
                          <div className={`break-words ${isNewMessage && msg.userId !== userId ? 'font-medium' : ''}`}>
                            {msg.message}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No messages yet
                </div>
              )}
            </ScrollArea>
          </CardContent>
          
          <CardFooter className="p-3 pt-0">
            <div className="flex w-full gap-2">
              <Button size="sm" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                😊
              </Button>
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={!isCollaborating}
              />
              <Button size="sm" onClick={sendMessage} disabled={!isCollaborating}>
                Send
              </Button>
            </div>
          </CardFooter>
        </>
      )}
      {showEmojiPicker && (
        <div className="absolute bottom-20 right-4">
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            theme="light"
            set="native"
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}
    </Card>
  );
}
