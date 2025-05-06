import random
import time
import uuid
from fastapi import WebSocket, WebSocketDisconnect

async def handle_websocket(websocket: WebSocket, session_id: str):
    try:
        # セッションに参加
        user_id = str(uuid.uuid4())
        user_name = None
        user_color = f"#{random.randint(0, 0xFFFFFF):06x}"
        
        # セッションが存在しない場合は作成
        if session_id not in sessions:
            sessions[session_id] = {
                "users": {},
                "code": "",
                "chat_messages": []
            }
        
        # ユーザーをセッションに追加
        sessions[session_id]["users"][user_id] = {
            "name": user_name,
            "color": user_color,
            "cursor": {"line": 0, "ch": 0}
        }
        
        # セッションの全ユーザーに通知
        await broadcast_to_session(session_id, {
            "type": "user-joined",
            "userId": user_id,
            "name": user_name,
            "color": user_color
        })
        
        # 現在のセッション情報を送信
        await websocket.send_json({
            "type": "joined",
            "sessionId": session_id,
            "userId": user_id,
            "color": user_color,
            "users": [
                {
                    "id": uid,
                    "name": data["name"],
                    "color": data["color"],
                    "cursor": data["cursor"]
                }
                for uid, data in sessions[session_id]["users"].items()
            ],
            "code": sessions[session_id]["code"],
            "chatMessages": sessions[session_id]["chat_messages"]
        })
        
        # メッセージループ
        while True:
            try:
                message = await websocket.receive_json()
                
                if message["type"] == "code-change":
                    # コードの変更を保存
                    sessions[session_id]["code"] = message["code"]
                    # 他のユーザーに通知
                    await broadcast_to_session(session_id, {
                        "type": "code-update",
                        "userId": user_id,
                        "code": message["code"]
                    }, exclude=user_id)
                
                elif message["type"] == "cursor-move":
                    # カーソル位置を更新
                    if user_id in sessions[session_id]["users"]:
                        sessions[session_id]["users"][user_id]["cursor"] = message["cursor"]
                        # 他のユーザーに通知
                        await broadcast_to_session(session_id, {
                            "type": "cursor-update",
                            "userId": user_id,
                            "userName": sessions[session_id]["users"][user_id]["name"],
                            "cursor": message["cursor"]
                        }, exclude=user_id)
                
                elif message["type"] == "chat-message":
                    # チャットメッセージを保存
                    chat_message = {
                        "id": str(uuid.uuid4()),
                        "userId": user_id,
                        "userName": sessions[session_id]["users"][user_id]["name"],
                        "message": message["message"],
                        "timestamp": int(time.time() * 1000)
                    }
                    sessions[session_id]["chat_messages"].append(chat_message)
                    # 全ユーザーに通知
                    await broadcast_to_session(session_id, {
                        "type": "chat-message",
                        "message": chat_message
                    })
                
                elif message["type"] == "name-change":
                    # ユーザー名を更新
                    if user_id in sessions[session_id]["users"]:
                        sessions[session_id]["users"][user_id]["name"] = message["newName"]
                        # 他のユーザーに通知
                        await broadcast_to_session(session_id, {
                            "type": "user-update",
                            "userId": user_id,
                            "newName": message["newName"]
                        }, exclude=user_id)
                
                elif message["type"] == "join":
                    # ユーザー名を設定
                    if "userName" in message:
                        user_name = message["userName"]
                        sessions[session_id]["users"][user_id]["name"] = user_name
                        # 他のユーザーに通知
                        await broadcast_to_session(session_id, {
                            "type": "user-update",
                            "userId": user_id,
                            "newName": user_name
                        }, exclude=user_id)
                    
                    # 初期コードを設定
                    if "initialCode" in message and not sessions[session_id]["code"]:
                        sessions[session_id]["code"] = message["initialCode"]
                        # 他のユーザーに通知
                        await broadcast_to_session(session_id, {
                            "type": "code-update",
                            "userId": user_id,
                            "code": message["initialCode"]
                        }, exclude=user_id)
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"Error handling message: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
    
    finally:
        # ユーザーをセッションから削除
        if session_id in sessions and user_id in sessions[session_id]["users"]:
            del sessions[session_id]["users"][user_id]
            # 他のユーザーに通知
            await broadcast_to_session(session_id, {
                "type": "user-left",
                "userId": user_id
            })
            # セッションが空になったら削除
            if not sessions[session_id]["users"]:
                del sessions[session_id]

async def broadcast_to_session(session_id: str, message: dict, exclude: str = None):
    """セッション内の全ユーザーにメッセージを送信"""
    if session_id in sessions:
        for user_id in sessions[session_id]["users"]:
            if exclude and user_id == exclude:
                continue
            try:
                await manager.send_json(message, user_id)
            except Exception as e:
                print(f"Error broadcasting to user {user_id}: {e}") 