import { useState, useEffect, useRef } from "react";
import { Separator } from "@/components/ui/separator";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";
import ExecuteButton from "@/components/ExecuteButton";
import CodeEditor from "@/components/CodeEditor";
import OutputConsole from "@/components/OutputConsole";
import DownloadOptions from "@/components/DownloadOptions";
import SystemInfo from "@/components/SystemInfo";
import ExampleSnippets from "@/components/ExampleSnippets";
import ChatWindow from "@/components/ChatWindow";
import { executeCode, getInterpreterVersion } from "@/lib/pyscript";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  // State for custom modules management
  const [moduleDialogOpen, setModuleDialogOpen] = useState<boolean>(false);
  const [customModules, setCustomModules] = useState<string[]>([]);
  const [newModuleName, setNewModuleName] = useState<string>("");
  const [code, setCode] = useState<string>(`import matplotlib.pyplot as plt
import numpy as np

# Generate data for the plot
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create a simple line plot
plt.figure(figsize=(8, 4))
plt.plot(x, y, 'b-', linewidth=2)
plt.title('Sine Wave')
plt.xlabel('X axis')
plt.ylabel('Y axis')
plt.grid(True)

# Show the plot
plt.show()

# Print some information
print(f"X range: {min(x)} to {max(x)}")
print(f"Y range: {min(y):.2f} to {max(y):.2f}")
`);

  // Use code examples from the ExampleSnippets component
  const [output, setOutput] = useState<string>("");
  // PyScriptは内部的にPyodideを使用します
  const interpreter = "pyodide";
  const [loading, setLoading] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("Loading...");
  const [location] = useLocation();
  const codeEditorRef = useRef<any>(null);
  const hasJoinedSession = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  
  // Collaboration related state
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [userId] = useState(`user-${Date.now()}`);
  const [userName, setUserName] = useState("");
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: number;
  }>>([]);
  
  // Handle new chat messages
  const handleNewChatMessage = (message: {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: number;
  }) => {
    setChatMessages(prev => [...prev, message]);
  };

  // Detect if there's a session ID in the URL
  useEffect(() => {
    const checkForCollaborationSession = () => {
      try {
        const url = new URL(window.location.href);
        const sessionId = url.searchParams.get("session");

        if (sessionId && !hasJoinedSession.current && codeEditorRef.current) {
          // Reference to the CodeEditor component's joinSession method
          if (typeof codeEditorRef.current.joinSession === "function") {
            console.log("Detected collaboration session in URL:", sessionId);
            toast({
              title: "Collaboration Session Detected",
              description: "Joining shared coding session...",
            });

            // Try multiple times with increasing delays to ensure editor is fully initialized
            const attemptJoin = (attempts = 0) => {
              if (attempts >= 5) {
                console.error("Failed to join session after multiple attempts");
                toast({
                  title: "Connection Error",
                  description:
                    "Could not join collaboration session. Please try again.",
                  variant: "destructive",
                });
                return;
              }

              try {
                if (
                  codeEditorRef.current &&
                  typeof codeEditorRef.current.joinSession === "function"
                ) {
                  console.log(
                    `Joining session ${sessionId} (attempt ${attempts + 1})`,
                  );
                  codeEditorRef.current.joinSession(sessionId);
                  hasJoinedSession.current = true;

                  // Remove session param from URL to prevent re-joining
                  const newUrl = new URL(window.location.href);
                  newUrl.searchParams.delete("session");
                  window.history.replaceState(
                    {},
                    document.title,
                    newUrl.toString(),
                  );
                } else {
                  // Editor not ready yet, try again later
                  console.log(
                    `Editor not ready, retrying in ${500 * (attempts + 1)}ms`,
                  );
                  setTimeout(
                    () => attemptJoin(attempts + 1),
                    500 * (attempts + 1),
                  );
                }
              } catch (err) {
                console.error(
                  `Error joining session (attempt ${attempts + 1}):`,
                  err,
                );
                setTimeout(
                  () => attemptJoin(attempts + 1),
                  500 * (attempts + 1),
                );
              }
            };

            // Start join attempts
            attemptJoin();
          }
        }
      } catch (e) {
        console.error("Error parsing collaboration session from URL", e);
      }
    };

    checkForCollaborationSession();
  }, [location]);

  useEffect(() => {
    // Get interpreter version
    const fetchVersion = async () => {
      try {
        const versionText = await getInterpreterVersion(interpreter);
        setVersion(versionText);
      } catch (error) {
        setVersion("Error loading version");
        console.error("Failed to load interpreter version:", error);
      }
    };

    fetchVersion();
    
    // リサイズハンドルの初期位置を設定
    const setResizeHandlePosition = () => {
      const resizeHandle = document.getElementById('resize-handle');
      if (resizeHandle) {
        const container = document.getElementById('main-grid');
        const editorSection = document.getElementById('editor-section');
        
        if (container && editorSection) {
          // グリッドの正確な中央に配置（最小オフセット）
          const editorWidth = editorSection.offsetWidth;
          const totalWidth = container.offsetWidth;
          const editorFraction = editorWidth / totalWidth;
          const handlePosition = editorFraction * 100;
          
          resizeHandle.style.left = `calc(${handlePosition}% - 1px)`;
        }
      }
    };
    
    // 初期設定
    setResizeHandlePosition();
    
    // ウィンドウサイズ変更時にリサイズハンドルの位置を再設定
    window.addEventListener('resize', setResizeHandlePosition);
    
    return () => {
      window.removeEventListener('resize', setResizeHandlePosition);
    };
  }, []);

  const handleRunCode = async () => {
    if (!code.trim()) {
      setOutput("No code to execute. Please write some code.");
      return;
    }
    
    // Set loading states first for a smoother transition
    setLoading(true);
    setOutput("Executing code...");
    
    // Small delay to allow loading animation to render before heavy operations
    // This helps prevent the UI thread from blocking
    await new Promise(resolve => setTimeout(resolve, 50));

    // Clear all plots before running new code
    // We need to clear both our container and Python's matplotlib output
    // to avoid artifacts from previous runs

    // Clear our plot container div
    const plotContainer = document.querySelector(".plot-container");
    if (plotContainer instanceof HTMLElement) {
      // 直接クリアして表示をリセット
      plotContainer.innerHTML = "";
      plotContainer.style.display = "none";
    }

    // Clear Python's original matplotlib output
    const pythonPlotDiv = document.getElementById("matplotlib-output");
    if (pythonPlotDiv) {
      pythonPlotDiv.innerHTML = "";
    }

    // Clear any matplotlib divs that might be lingering
    document.querySelectorAll('div[id^="matplotlib_"]').forEach((div) => {
      try {
        if (div.parentNode) {
          div.parentNode.removeChild(div);
        }
      } catch (e) {
        console.error("Error removing matplotlib div:", e);
      }
    });

    try {
      // Pass custom modules to the execution environment
      const result = await executeCode(code, interpreter, customModules);
      
      // Small delay before updating UI to ensure smooth transition
      setTimeout(() => {
        setOutput(result);
        setLoading(false);
      }, 100);
    } catch (error) {
      // Small delay before updating UI to ensure smooth transition
      setTimeout(() => {
        setOutput(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        setLoading(false);
      }, 100);
    }
  };

  const handleClearEditor = () => {
    if (window.confirm("Are you sure you want to clear the editor?")) {
      setCode("");
    }
  };

  const handleClearOutput = () => {
    setOutput("");
  };

  // Module management handlers
  const handleAddModule = () => {
    if (!newModuleName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a module name",
        variant: "destructive",
      });
      return;
    }

    if (customModules.includes(newModuleName.trim())) {
      toast({
        title: "Module Already Added",
        description: `The module '${newModuleName}' is already in your list`,
        variant: "destructive",
      });
      return;
    }

    setCustomModules([...customModules, newModuleName.trim()]);
    setNewModuleName("");
    toast({
      title: "Module Added",
      description: `Added '${newModuleName}' to available modules`,
    });
  };

  const handleRemoveModule = (moduleName: string) => {
    setCustomModules(customModules.filter((m) => m !== moduleName));
    toast({
      title: "Module Removed",
      description: `Removed '${moduleName}' from available modules`,
    });
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col overflow-x-hidden">
      {/* No navbar */}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 overflow-auto" style={{ minWidth: 'calc(100% - 2rem)' }}>
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            ブラウザPythonコンパイラ for ペアプロラーニング
          </h1>
          <p className="text-gray-600 mt-2">
            Write, execute, and download Python code directly in your browser
          </p>
        </header>

        <Separator className="my-4" />

        {/* Resizable Layout Compiler Interface */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative min-h-fit" id="main-grid" style={{overflow: 'visible'}}>
          {/* Chat Panel - Side drawer that appears when chat button is clicked */}
          {isCollaborating && showChatPanel && (
            <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-300 shadow-lg z-50 overflow-y-auto transition-transform duration-300"
              style={{ transform: showChatPanel ? 'translateX(0)' : 'translateX(100%)' }}
            >
              <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
                <h3 className="font-medium">Chat</h3>
                <button
                  onClick={() => setShowChatPanel(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              <div className="p-4">
                <div className="space-y-4 mb-4">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`p-3 rounded-lg ${msg.userId === userId ? 'bg-blue-100 ml-4' : 'bg-gray-100 mr-4'}`}>
                      <div className="flex items-center mb-1">
                        <span className="font-medium mr-2">{msg.userId === userId ? 'You' : msg.userName}</span>
                        <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p>{msg.message}</p>
                    </div>
                  ))}
                </div>
                
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
                    if (input.value.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
                      const message = {
                        type: 'chat-message',
                        sessionId,
                        userId,
                        userName: userName || 'Anonymous',
                        message: input.value.trim(),
                        timestamp: Date.now(),
                      };
                      wsRef.current.send(JSON.stringify(message));
                      input.value = '';
                    }
                  }}
                  className="mt-4"
                >
                  <div className="flex">
                    <input
                      type="text"
                      name="message"
                      className="flex-1 border border-gray-300 rounded-l-md p-2"
                      placeholder="Type a message..."
                    />
                    <button
                      type="submit"
                      className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600 transition-colors"
                    >
                      Send
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {/* Editor Section */}
          <div className="space-y-4" id="editor-section" style={{minWidth: 0, width: '100%'}}>
            {/* Code Editor with Execute Button */}
            <div className="flex items-center justify-start gap-2 h-10 pl-0">
              <div className="mr-auto">
                <ExecuteButton onRunCode={handleRunCode} loading={loading} />
              </div>
              {isCollaborating && (
                <Button 
                  variant="outline" 
                  className="flex items-center gap-1 bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-700"
                  onClick={() => setShowChatPanel(!showChatPanel)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Chat
                </Button>
              )}
            </div>

            <div className="w-full" style={{ height: 'auto', minHeight: '512px', flex: '1 0 auto', resize: 'vertical', overflow: 'auto' }}>
              <CodeEditor
                ref={codeEditorRef}
                code={code}
                setCode={setCode}
                onClear={handleClearEditor}
              />
            </div>

            <ExampleSnippets setCode={setCode} />
          </div>

          {/* Divider between Editor and Output */}
          <div
            id="resize-handle"
            className="hidden md:flex items-center justify-center w-6 cursor-col-resize absolute top-0 bottom-0 z-50"
            style={{ 
              position: 'absolute', 
              height: '100%',
              left: 'calc(50% - 1px)' // オフセットを1pxに調整
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              // Get grid container and its computed styles
              const container = document.getElementById('main-grid') as HTMLElement;
              const editorSection = document.getElementById('editor-section') as HTMLElement;
              const outputSection = document.getElementById('output-section') as HTMLElement;
              
              // Get current grid template from DOM
              const editorRect = editorSection.getBoundingClientRect();
              const outputRect = outputSection.getBoundingClientRect();
              const totalWidth = editorRect.width + outputRect.width;
              
              // Store initial dimensions
              const initialEditorWidth = editorRect.width;
              const initialOutputWidth = outputRect.width;
              const startX = e.clientX;

              const handleMouseMove = (moveEvent: MouseEvent) => {
                // Calculate delta from drag start
                const deltaX = moveEvent.clientX - startX;
                const newEditorWidth = initialEditorWidth + deltaX;
                const newOutputWidth = initialOutputWidth - deltaX;
                
                // Enforce minimum widths (20% of total width)
                const minWidth = totalWidth * 0.2;
                if (newEditorWidth > minWidth && newOutputWidth > minWidth) {
                  // Calculate percentage widths
                  const editorFraction = newEditorWidth / totalWidth;
                  const outputFraction = 1 - editorFraction;
                  
                  // Apply new grid template with percentages
                  container.style.gridTemplateColumns = `${editorFraction * 100}% ${outputFraction * 100}%`;
                  
                  // Update resize handle position
                  const resizeHandle = document.getElementById('resize-handle');
                  if (resizeHandle) {
                    // Position the handle at the grid division with minimal offset
                    const handlePosition = editorFraction * 100;
                    resizeHandle.style.left = `calc(${handlePosition}% - 1px)`;
                  }

                  // Ensure content is visible by adjusting container width
                  const editorSection = document.getElementById('editor-section');
                  const outputSection = document.getElementById('output-section');
                  if (editorSection && outputSection) {
                    editorSection.style.width = '100%';
                    editorSection.style.overflow = 'hidden';
                    outputSection.style.width = '100%';
                    outputSection.style.overflow = 'hidden';
                  }
                }
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="h-24 w-0.5 bg-blue-500 rounded-full relative hover:bg-blue-600 hover:w-1 transition-all duration-150">
              {/* Handle grips */}
              <div className="absolute left-1/2 top-1/3 w-2 h-2 bg-blue-600 rounded-full transform -translate-x-1/2"></div>
              <div className="absolute left-1/2 top-2/3 w-2 h-2 bg-blue-600 rounded-full transform -translate-x-1/2"></div>
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-4" id="output-section" style={{minWidth: 0, width: '100%'}}>
            {/* Output Console with aligned height - Empty space to match Execute Button height */}
            <div className="flex items-center justify-start gap-2 h-10 invisible">
              <div className="h-10 w-[112px]"></div>
            </div>
            
            <div 
              className="w-full output-container resize-sync-parent" 
              style={{ 
                minHeight: '512px', 
                height: '512px',
                display: 'flex', 
                flexDirection: 'column',
                transition: 'height 0.2s ease-in-out',
                position: 'relative'
              }}
            >
              <OutputConsole 
                output={output} 
                onClear={handleClearOutput} 
                onResize={(newHeight) => {
                  // When OutputConsole is resized, find the parent container and adjust its height
                  const outputContainer = document.querySelector('.resize-sync-parent') as HTMLElement;
                  if (outputContainer) {
                    outputContainer.style.height = `${newHeight}px`;
                    outputContainer.style.minHeight = `${newHeight}px`;
                  }
                }}
              />
            </div>

            <div className="w-full">
              <DownloadOptions code={code} output={output} />
            </div>

            <div className="w-full">
              <SystemInfo interpreter={interpreter} version={version} />
            </div>

            {/* Module Management Section */}
            <div className="p-4 bg-white rounded-md shadow-sm border border-gray-300">
              <h3 className="font-medium text-gray-700 mb-3">Custom Modules</h3>
              
              <div className="flex mb-3">
                <input
                  type="text"
                  placeholder="Enter module name"
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  className="flex-1 mr-2 border border-gray-300 rounded p-2"
                />
                <button
                  type="button"
                  onClick={handleAddModule}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                >
                  Add Module
                </button>
              </div>

              <div className="space-y-2">
                {customModules.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No custom modules added yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {customModules.map((module) => (
                      <span
                        key={module}
                        className="bg-gray-200 text-gray-800 px-2 py-1 rounded flex items-center gap-1"
                      >
                        {module}
                        <button
                          className="ml-1 text-gray-500 hover:text-red-500"
                          onClick={() => handleRemoveModule(module)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Floating Chat Window */}
      {isCollaborating && (
        <ChatWindow
          messages={chatMessages}
          isCollaborating={isCollaborating}
          sessionId={sessionId}
          userId={userId}
          userName={userName || "Anonymous"}
          wsRef={wsRef}
          onNewMessage={handleNewChatMessage}
          className="fixed left-4 bottom-4"
        />
      )}

      {/* Custom Module Dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Python Module</DialogTitle>
            <DialogDescription>
              Add Python modules you'd like to use in your code. Only modules
              available in Pyodide can be imported.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="module-name" className="text-right">
                Module Name
              </Label>
              <Input
                id="module-name"
                placeholder="e.g. scipy, sympy, etc."
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModuleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddModule}>Add Module</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Footer with GitHub Link */}
      <footer className="py-4 bg-gray-100 border-t border-gray-200 mt-8 w-full relative z-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center text-sm text-gray-500">
            <a 
              href="https://github.com/smastu" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center hover:text-blue-600 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
              <span>Developed by smastu</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}