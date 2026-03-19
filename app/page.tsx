'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  User,
  CheckCircle2,
  RefreshCw,
  MessageSquare,
  Bot,
  FileText
} from 'lucide-react';

interface TranscriptMessage {
  id: string;
  speaker: 'agent' | 'user';
  text: string;
  timestamp: Date;
}

interface UpdateTicketParams {
  contact_name: string;
  contact_company_name: string;
  contact_information: string;
  issue_description: string;
  affected_device: string;
  location: string;
}

export default function VoiceAgentPage() {
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const transcriptRef = useRef<TranscriptMessage[]>([]);
  const [callEnded, setCallEnded] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [toolCallResults, setToolCallResults] = useState<{ updateTicket?: UpdateTicketParams }>({});
  const [connectionStatus, setConnectionStatus] = useState<'stable' | 'unstable' | 'reconnecting'>('stable');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to agent');
      setIsCallActive(true);
      setCallEnded(false);
      setConnectionStatus('stable');
      setReconnectAttempts(0);
      if (!isReconnecting) {
        setTranscripts([]);
        setToolCallResults({});
      } else {
        toast.success('Reconnected successfully!');
        setIsReconnecting(false);
      }
    },
    onDisconnect: (details) => {
      console.log('Disconnected from agent:', details);
      setIsCallActive(false);
      setConnectionStatus('unstable');
      
      if (details.reason !== 'user' && reconnectAttempts < 2) {
        attemptReconnect();
      } else if (reconnectAttempts >= 2) {
        setCallEnded(true);
        toast.error('Connection lost. Please try again.');
      } else {
        setCallEnded(true);
      }
    },
    onStatusChange: ({ status }) => {
      if (status === 'connecting') setConnectionStatus('reconnecting');
      if (status === 'connected') setConnectionStatus('stable');
    },
    onMessage: (message) => {
      const cleanText = message.message.replace(/<[A-Za-z0-9]+>[^<]*<\/[A-Za-z0-9]+>/g, '').trim();
      if (!cleanText) return;
      const speaker = message.source === 'user' ? 'user' : 'agent';
      const newMessage: TranscriptMessage = {
        id: crypto.randomUUID(),
        speaker,
        text: cleanText,
        timestamp: new Date(),
      };
      setTranscripts(prev => {
        if (prev.some(m => m.text === cleanText && m.speaker === speaker)) return prev;
        return [...prev, newMessage];
      });
    },
    onError: (error) => {
      console.error('Conversation error:', error);
      toast.error(`Conversation error: ${error}`);
    },
    clientTools: {
      updateTicket: async (params: UpdateTicketParams) => {
        console.log('updateTicket called with params:', params);
        setToolCallResults(prev => ({
          ...prev,
          updateTicket: params,
        }));
        return JSON.stringify({ success: true, ticketId: `TICKET-${Date.now()}` });
      },
    },
  });

  const attemptReconnect = useCallback(async () => {
    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);
    setConnectionStatus('reconnecting');
    toast.warning(`Connection lost. Reconnecting... (Attempt ${reconnectAttempts + 1}/2)`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const response = await fetch('/api/get-signed-url');
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      await conversation.startSession({
        connectionType: 'webrtc',
        agentId: data.agentId,
        conversationToken: data.token,
      });
    } catch (error) {
      console.error('Reconnection failed:', error);
      if (reconnectAttempts < 1) {
        attemptReconnect();
      } else {
        setCallEnded(true);
        setConnectionStatus('unstable');
        toast.error('Connection lost. Please try again.');
      }
    }
  }, [conversation, reconnectAttempts]);

  useEffect(() => {
    transcriptRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallActive && conversation.status === 'connected') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive, conversation.status]);

  const startCall = useCallback(async () => {
    try {
      setCallDuration(0);
      setReconnectAttempts(0);
      setConnectionStatus('reconnecting');
      toast.info('Connecting to Spencer...');
      
      const response = await fetch('/api/get-signed-url');
      const data = await response.json();
      
      if (data.error) {
        console.error('Failed to get token:', data.error);
        toast.error('Failed to connect. Please try again.');
        return;
      }

      await conversation.startSession({
        connectionType: 'webrtc',
        agentId: data.agentId,
        conversationToken: data.token,
        connectionDelay: {
          default: 100,
        },
      });
    } catch (error) {
      console.error('Failed to start conversation:', error);
      toast.error('Failed to start conversation.');
    }
  }, [conversation]);

  const endCall = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const resetCall = () => {
    setTranscripts([]);
    setCallEnded(false);
    setCallDuration(0);
    setToolCallResults({});
    setConnectionStatus('stable');
    setReconnectAttempts(0);
    setIsReconnecting(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Voice Support Agent
          </h1>
          <p className="text-slate-400">Customer Support Ticketing - POC Demo</p>
        </div>

        {!isCallActive && !callEnded && (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="relative mb-8">
              <div className="w-40 h-40 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-2xl">
                <Bot className="w-20 h-20 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-emerald-500 border-4 border-slate-900 flex items-center justify-center">
                <span className="text-white font-bold text-xs">S</span>
              </div>
            </div>
            
            <h2 className="text-2xl font-semibold text-white mb-2">Ready to Assist</h2>
            <p className="text-slate-400 mb-8 text-center max-w-md">
              Click below to start a voice call with Spencer. He will collect customer support information including name, company, contact, device, and location.
            </p>
            
            <Button 
              onClick={startCall}
              className="w-64 h-16 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white text-xl font-semibold rounded-full shadow-lg transition-all duration-300 hover:scale-105"
              disabled={conversation.status === 'connecting'}
            >
              {conversation.status === 'connecting' ? (
                <>
                  <RefreshCw className="w-6 h-6 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="w-6 h-6 mr-2" />
                  Start Call
                </>
              )}
            </Button>
          </div>
        )}

        {(isCallActive || conversation.status === 'connected') && (
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {connectionStatus === 'reconnecting' ? (
                        <div className="w-16 h-16 rounded-full bg-yellow-500 flex items-center justify-center animate-pulse">
                          <RefreshCw className="w-8 h-8 text-white animate-spin" />
                        </div>
                      ) : connectionStatus === 'unstable' ? (
                        <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
                          <PhoneOff className="w-8 h-8 text-white" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center animate-pulse">
                          <Bot className="w-8 h-8 text-white" />
                        </div>
                      )}
                      {conversation.isSpeaking && (
                        <div className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white">
                        {connectionStatus === 'reconnecting' ? 'Reconnecting...' : connectionStatus === 'unstable' ? 'Connection Lost' : 'Spencer'}
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {connectionStatus === 'reconnecting' 
                          ? `Attempt ${reconnectAttempts + 1}/2...` 
                          : connectionStatus === 'unstable' 
                            ? 'Please wait' 
                            : conversation.isSpeaking ? 'Speaking...' : 'Listening...'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-white border-slate-500 px-3 py-1">
                      {formatDuration(callDuration)}
                    </Badge>
                    <Button 
                      onClick={endCall}
                      className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white p-0"
                    >
                      <PhoneOff className="w-6 h-6" />
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-64 rounded-lg bg-slate-900/50 p-4">
                  {transcripts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <Mic className="w-12 h-12 mb-2 animate-pulse" />
                      <p>Start speaking to see transcript...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {transcripts.map((msg) => (
                        <div 
                          key={msg.id}
                          className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div 
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                              msg.speaker === 'user' 
                                ? 'bg-emerald-500 text-white rounded-br-sm' 
                                : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {msg.speaker === 'user' ? (
                                <User className="w-4 h-4" />
                              ) : (
                                <Bot className="w-4 h-4" />
                              )}
                              <span className="text-xs opacity-75">
                                {msg.speaker === 'user' ? 'You' : 'Spencer'}
                              </span>
                            </div>
                            <p className="text-sm">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {callEnded && (
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <div>
                      <h3 className="text-xl font-semibold text-white">Call Ended</h3>
                      <p className="text-slate-400 text-sm">
                        Duration: {formatDuration(callDuration)} | {transcripts.length} messages
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={resetCall}
                    className="bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    New Call
                  </Button>
                </div>

                <div className="space-y-6">
  

                  {toolCallResults.updateTicket && (
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-500" />
                        Ticket Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 rounded-lg p-4">
                          <p className="text-slate-400 text-sm mb-1">Contact Name</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.contact_name || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4">
                          <p className="text-slate-400 text-sm mb-1">Company</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.contact_company_name || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4">
                          <p className="text-slate-400 text-sm mb-1">Contact Information</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.contact_information || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4">
                          <p className="text-slate-400 text-sm mb-1">Location</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.location || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 md:col-span-2">
                          <p className="text-slate-400 text-sm mb-1">Issue Description</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.issue_description || 'N/A'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 md:col-span-2">
                          <p className="text-slate-400 text-sm mb-1">Affected Device</p>
                          <p className="text-white font-medium">{toolCallResults.updateTicket.affected_device || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-cyan-500" />
                      Full Transcript
                    </h4>
                    <ScrollArea className="h-64 rounded-lg bg-slate-900/50 p-4">
                      <div className="space-y-3">
                        {transcripts.map((msg) => (
                          <div 
                            key={msg.id}
                            className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div 
                              className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${
                                msg.speaker === 'user' 
                                  ? 'bg-emerald-500/20 text-emerald-300' 
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              <span className="font-semibold mr-2">
                                {msg.speaker === 'user' ? 'You:' : 'Spencer:'}
                              </span>
                              {msg.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
