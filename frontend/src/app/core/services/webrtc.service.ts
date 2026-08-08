import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
  message: string;
  senderName: string;
  senderRole: string;
  senderSocketId: string;
  timestamp: string | Date;
}

export interface PeerUser {
  socketId: string;
  userId: string;
  userRole: string;
  userName: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebRtcService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  public localStream$ = new BehaviorSubject<MediaStream | null>(null);
  public remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
  public peerUsers$ = new BehaviorSubject<PeerUser[]>([]);
  public chatMessages$ = new BehaviorSubject<ChatMessage[]>([]);
  public callEnded$ = new Subject<{ endedBy?: string }>();
  public isScreenSharing$ = new BehaviorSubject<boolean>(false);
  public peerMediaStatus$ = new BehaviorSubject<{ audioEnabled: boolean; videoEnabled: boolean }>({
    audioEnabled: true,
    videoEnabled: true
  });

  private currentAppointmentId: string | null = null;
  private currentTargetSocketId: string | null = null;
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  constructor() {}

  /**
   * Connect to Socket.io signaling server
   */
  public connect(serverUrl: string = 'http://localhost:5000'): void {
    if (!this.socket) {
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true
      });
      this.setupSocketListeners();
    }
  }

  /**
   * Set ICE Servers from backend configuration
   */
  public setIceServers(servers: RTCIceServer[]): void {
    if (servers && servers.length > 0) {
      this.iceServers = servers;
    }
  }

  /**
   * Start local camera and microphone stream
   */
  public async startLocalStream(video: boolean = true, audio: boolean = true): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } } : false,
        audio: audio
      });
      this.localStream$.next(this.localStream);
      return this.localStream;
    } catch (err: any) {
      console.error('[WebRtcService] Error acquiring media devices:', err);
      throw err;
    }
  }

  /**
   * Join Consultation Room
   */
  public joinRoom(appointmentId: string, userId: string, userRole: string, userName: string): void {
    this.currentAppointmentId = appointmentId;
    if (this.socket) {
      this.socket.emit('join-room', {
        appointmentId,
        userId,
        userRole,
        userName
      });
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Room user list upon joining
    this.socket.on('room-users', async (users: PeerUser[]) => {
      this.peerUsers$.next(users);
      if (users.length > 0) {
        // We are the caller joining second or existing peers present -> initiate connection to primary target
        const primaryPeer = users[0];
        this.currentTargetSocketId = primaryPeer.socketId;
        await this.initiateCall(primaryPeer.socketId);
      }
    });

    // New peer joined room
    this.socket.on('user-joined', (user: PeerUser) => {
      const current = this.peerUsers$.getValue();
      this.peerUsers$.next([...current, user]);
      this.currentTargetSocketId = user.socketId;
    });

    // Receive Offer
    this.socket.on('offer', async (data: { callerSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      this.currentTargetSocketId = data.callerSocketId;
      await this.handleOffer(data.callerSocketId, data.sdp);
    });

    // Receive Answer
    this.socket.on('answer', async (data: { responderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    });

    // Receive ICE Candidate
    this.socket.on('ice-candidate', async (data: { senderSocketId: string; candidate: RTCIceCandidateInit }) => {
      try {
        if (this.peerConnection && data.candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error('[WebRtcService] Error adding ICE candidate:', err);
      }
    });

    // Peer Media Toggled
    this.socket.on('peer-media-toggled', (data: { mediaType: string; enabled: boolean }) => {
      const currentStatus = this.peerMediaStatus$.getValue();
      if (data.mediaType === 'audio') {
        this.peerMediaStatus$.next({ ...currentStatus, audioEnabled: data.enabled });
      } else if (data.mediaType === 'video') {
        this.peerMediaStatus$.next({ ...currentStatus, videoEnabled: data.enabled });
      }
    });

    // Live Chat Message
    this.socket.on('chat-message', (msg: ChatMessage) => {
      const current = this.chatMessages$.getValue();
      this.chatMessages$.next([...current, msg]);
    });

    // Call Ended
    this.socket.on('call-ended', (data: { endedBy?: string }) => {
      this.callEnded$.next(data);
      this.cleanup();
    });

    // Peer Disconnected
    this.socket.on('user-left', (data: { socketId: string; userName: string }) => {
      const remaining = this.peerUsers$.getValue().filter(u => u.socketId !== data.socketId);
      this.peerUsers$.next(remaining);
      this.remoteStream$.next(null);
    });
  }

  /**
   * Initiate Call (Caller creates Peer Connection and sends Offer)
   */
  private async initiateCall(targetSocketId: string): Promise<void> {
    this.createPeerConnection(targetSocketId);

    if (this.peerConnection) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket?.emit('offer', {
        targetSocketId,
        sdp: offer
      });
    }
  }

  /**
   * Handle Received Offer (Receiver sets Remote Description & sends Answer)
   */
  private async handleOffer(targetSocketId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    this.createPeerConnection(targetSocketId);

    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket?.emit('answer', {
        targetSocketId,
        sdp: answer
      });
    }
  }

  /**
   * Create RTCPeerConnection instance
   */
  private createPeerConnection(targetSocketId: string): void {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Attach local stream tracks to Peer Connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Handle remote track received
    this.peerConnection.ontrack = (event: RTCTrackEvent) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream$.next(event.streams[0]);
      } else {
        const stream = new MediaStream();
        stream.addTrack(event.track);
        this.remoteStream$.next(stream);
      }
    };

    // Handle local ICE candidates
    this.peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && this.socket) {
        this.socket.emit('ice-candidate', {
          targetSocketId,
          candidate: event.candidate
        });
      }
    };
  }

  /**
   * Mute / Unmute Microphone
   */
  public toggleAudio(): boolean {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !audioTracks[0].enabled;
        audioTracks[0].enabled = enabled;
        
        if (this.currentAppointmentId) {
          this.socket?.emit('toggle-media', {
            appointmentId: this.currentAppointmentId,
            mediaType: 'audio',
            enabled
          });
        }
        return enabled;
      }
    }
    return false;
  }

  /**
   * Turn Camera On / Off
   */
  public toggleVideo(): boolean {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = enabled;

        if (this.currentAppointmentId) {
          this.socket?.emit('toggle-media', {
            appointmentId: this.currentAppointmentId,
            mediaType: 'video',
            enabled
          });
        }
        return enabled;
      }
    }
    return false;
  }

  /**
   * Toggle Screen Sharing
   */
  public async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing$.getValue()) {
      this.stopScreenShare();
      return false;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = this.screenStream.getVideoTracks()[0];

      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }

      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      this.isScreenSharing$.next(true);
      return true;
    } catch (err) {
      console.error('[WebRtcService] Error starting screen share:', err);
      return false;
    }
  }

  public stopScreenShare(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    if (this.localStream && this.peerConnection) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender && cameraTrack) {
        sender.replaceTrack(cameraTrack);
      }
    }

    this.isScreenSharing$.next(false);
  }

  /**
   * Send live in-call text chat message
   */
  public sendChatMessage(message: string, senderName: string, senderRole: string): void {
    if (!message.trim() || !this.currentAppointmentId) return;
    this.socket?.emit('send-chat-message', {
      appointmentId: this.currentAppointmentId,
      message,
      senderName,
      senderRole
    });
  }

  /**
   * End Consultation Call
   */
  public endCall(appointmentId: string): void {
    this.socket?.emit('end-call', { appointmentId });
    this.cleanup();
  }

  /**
   * Cleanup media streams and web sockets
   */
  public cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      this.localStream$.next(null);
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream$.next(null);
    this.peerUsers$.next([]);
    this.chatMessages$.next([]);
    this.isScreenSharing$.next(false);

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
