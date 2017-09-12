import { EventEmitter } from 'events';
import { steamworks } from 'steam';
import { LOBBY_GAME_GUID } from 'constants/steamworks';
import { Deferred } from 'utils/async';
import { SessionKey } from 'platform/types';

type SteamID64 = Steamworks.SteamID64;

interface SteamMatchmakingLobbyOptions {
  // Join options

  /** Lobby Steam ID to join. If left out, a new lobby is created. */
  steamId?: Steamworks.SteamID64;

  // Create options

  lobbyType?: Steamworks.LobbyType;
  maxMembers?: number;
}

export interface ISteamLobbyChatEnvelope {
  entry: Steamworks.ILobbyChatEntry;
  userId: Steamworks.SteamID;
}

export class SteamMatchmakingLobby extends EventEmitter {
  steamId: SteamID64;
  ownerSteamId: Steamworks.SteamID;
  isOwner: boolean = false;

  private constructor(lobbyId: string) {
    super();
    this.steamId = lobbyId;
    window.addEventListener('beforeunload', this.close, false);
    this.onJoin();
  }

  private onJoin(): void {
    const ownerSteamId = steamworks.getLobbyOwner(this.steamId);
    const localSteamId = steamworks.getSteamId();

    this.ownerSteamId = ownerSteamId;
    this.isOwner = ownerSteamId.getRawSteamID() === localSteamId.getRawSteamID();

    if (this.isOwner) {
      const lobbyName = `${localSteamId.getPersonaName()}'s Lobby`;
      steamworks.setLobbyData(this.steamId, SessionKey.Name, lobbyName);
      steamworks.setLobbyData(this.steamId, SessionKey.Guid, LOBBY_GAME_GUID);
    }

    steamworks.on('lobby-chat-message', this.onMessage);

    console.log('Joined Steam lobby', this.steamId);
    this.emit('connect', this.steamId);
  }

  private onLeave(): void {
    steamworks.removeListener('lobby-chat-message', this.onMessage);
  }

  private onMessage = (
    lobbyId: Steamworks.SteamID,
    userId: Steamworks.SteamID,
    type: any,
    chatId: number
  ): void => {
    const entry = steamworks.getLobbyChatEntry(lobbyId.getRawSteamID(), chatId);
    console.log('Received Steam lobby message', entry, userId);
    this.emit('message', {
      entry,
      userId
    } as ISteamLobbyChatEnvelope);
  };

  close = (): void => {
    steamworks.leaveLobby(this.steamId);
  };

  getOwner(): SteamID64 {
    return this.ownerSteamId.getRawSteamID();
  }

  sendChatMessage(message: Buffer) {
    steamworks.sendLobbyChatMsg(this.steamId, message);
  }

  static async createLobby(opts: SteamMatchmakingLobbyOptions): Promise<SteamMatchmakingLobby> {
    const deferred = new Deferred<SteamMatchmakingLobby>();

    steamworks.createLobby(
      opts.lobbyType || steamworks.LobbyType.Public,
      opts.maxMembers || 8,
      lobbyId => {
        const lobby = new SteamMatchmakingLobby(lobbyId);
        deferred.resolve(lobby);
      }
    );

    return deferred.promise;
  }

  static async joinLobby(opts: SteamMatchmakingLobbyOptions): Promise<SteamMatchmakingLobby> {
    const deferred = new Deferred<SteamMatchmakingLobby>();

    steamworks.joinLobby(opts.steamId!, _lobbyId => {
      // BUG: _lobbyId === '1'???
      const lobbyId = opts.steamId!;
      const lobby = new SteamMatchmakingLobby(lobbyId);
      deferred.resolve(lobby);
    });

    return deferred.promise;
  }
}
