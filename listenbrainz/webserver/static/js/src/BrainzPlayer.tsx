import * as React from "react";
import {
  isEqual as _isEqual,
  isString as _isString,
  get as _get,
} from "lodash";
import * as _ from "lodash";
import PlaybackControls from "./PlaybackControls";
import APIService from "./APIService";
import SpotifyPlayer from "./SpotifyPlayer";
import YoutubePlayer from "./YoutubePlayer";

export type DataSourceType = {
  playListen: (listen: Listen) => void;
  togglePlay: () => void;
  seekToPositionMs: (msTimecode: number) => void;
};

export type DataSourceTypes = SpotifyPlayer | YoutubePlayer;

export type DataSourceProps = {
  show: boolean;
  playerPaused: boolean;
  onPlayerPausedChange: (paused: boolean) => void;
  onProgressChange: (progressMs: number) => void;
  onDurationChange: (durationMs: number) => void;
  onTrackInfoChange: (title: string, artist?: string) => void;
  onTrackEnd: () => void;
  onTrackNotFound: () => void;
  handleError: (error: string | Error, title?: string) => void;
  handleWarning: (message: string | JSX.Element, title?: string) => void;
  handleSuccess: (message: string | JSX.Element, title?: string) => void;
  onInvalidateDataSource: (
    dataSource?: DataSourceTypes,
    message?: string | JSX.Element
  ) => void;
};

type BrainzPlayerProps = {
  spotifyUser: SpotifyUser;
  direction: BrainzPlayDirection;
  onCurrentListenChange: (listen: Listen) => void;
  currentListen?: Listen;
  listens: Array<Listen>;
  newAlert: (
    alertType: AlertType,
    title: string,
    message: string | JSX.Element
  ) => void;
  apiService: APIService;
};

type BrainzPlayerState = {
  currentDataSourceIndex: number;
  currentTrackName: string;
  currentTrackArtist?: string;
  direction: BrainzPlayDirection;
  playerPaused: boolean;
  durationMs: number;
  progressMs: number;
  updateTime: number;
};

export default class BrainzPlayer extends React.Component<
  BrainzPlayerProps,
  BrainzPlayerState
> {
  spotifyPlayer?: React.RefObject<SpotifyPlayer>;
  youtubePlayer?: React.RefObject<YoutubePlayer>;
  dataSources: Array<React.RefObject<DataSourceTypes>> = [];

  // Since we don't want autoplay on our pages, we need a way to know
  // that a user clicked on the play/pause button for the first time
  // to start the playlist. Subsequent uses should toggle play/pause.
  firstRun: boolean = true;

  playerStateTimerID?: NodeJS.Timeout;

  constructor(props: BrainzPlayerProps) {
    super(props);

    const { access_token, permission } = props.spotifyUser;

    this.spotifyPlayer = React.createRef<SpotifyPlayer>();
    if (access_token && permission) {
      this.dataSources.push(this.spotifyPlayer);
    }

    this.youtubePlayer = React.createRef<YoutubePlayer>();
    this.dataSources.push(this.youtubePlayer);

    this.state = {
      currentDataSourceIndex: 0,
      currentTrackName: this.getCurrentTrackName(),
      currentTrackArtist: this.getCurrentTrackArtists(),
      direction: props.direction || "down",
      playerPaused: true,
      progressMs: 0,
      durationMs: 0,
      updateTime: performance.now(),
    };
  }

  isCurrentListen = (element: Listen): boolean => {
    const { currentListen } = this.props;
    return (currentListen && _isEqual(element, currentListen)) as boolean;
  };

  playPreviousTrack = (): void => {
    this.playNextTrack(true);
  };

  playNextTrack = (invert: boolean = false): void => {
    const { listens } = this.props;
    const { direction } = this.state;

    if (listens.length === 0) {
      this.handleWarning(
        "You can try loading listens or refreshing the page",
        "No listens to play"
      );
      return;
    }

    const currentListenIndex = listens.findIndex(this.isCurrentListen);

    let nextListenIndex;
    if (currentListenIndex === -1) {
      nextListenIndex = direction === "up" ? listens.length - 1 : 0;
    } else if (direction === "up") {
      nextListenIndex =
        invert === true ? currentListenIndex + 1 : currentListenIndex - 1 || 0;
    } else if (direction === "down") {
      nextListenIndex =
        invert === true ? currentListenIndex - 1 || 0 : currentListenIndex + 1;
    } else {
      this.handleWarning("Please select a song to play", "Unrecognised state");
      return;
    }

    const nextListen = listens[nextListenIndex];
    if (!nextListen) {
      this.handleWarning(
        "You can try loading more listens or refreshing the page",
        "No more listens to play"
      );
      return;
    }
    this.playListen(nextListen);
  };

  handleError = (error: string | Error, title?: string): void => {
    const { newAlert } = this.props;
    if (!error) {
      return;
    }
    newAlert(
      "danger",
      title || "Playback error",
      typeof error === "object" ? error.message : error
    );
  };

  handleWarning = (message: string | JSX.Element, title?: string): void => {
    const { newAlert } = this.props;
    newAlert("warning", title || "Playback error", message);
  };

  handleSuccess = (message: string | JSX.Element, title?: string): void => {
    const { newAlert } = this.props;
    newAlert("success", title || "Success", message);
  };

  invalidateDataSource = (
    dataSource?: DataSourceTypes,
    message?: string | JSX.Element
  ): void => {
    let { currentDataSourceIndex: dataSourceIndex } = this.state;
    if (dataSource) {
      dataSourceIndex = this.dataSources.findIndex(
        (source) => source.current === dataSource
      );
    }
    if (dataSourceIndex >= 0) {
      if (message) {
        this.handleWarning(message, "Cannot play from this source");
      }
      this.dataSources.splice(dataSourceIndex, 1);
    }
  };

  playListen = (listen: Listen, datasourceIndex: number = 0): void => {
    let selectedDatasourceIndex = datasourceIndex;
    const { onCurrentListenChange } = this.props;
    onCurrentListenChange(listen);
    if (this.firstRun) {
      this.firstRun = false;
    }

    /** If available, retreive the service the listen was listened with */
    // TODO: this should be moved to a different function eventually when
    // the logic gets too much for one function
    const listeningFrom = _get(
      listen,
      "track_metadata.additional_info.listening_from"
    );
    const originURL = _get(listen, "track_metadata.additional_info.origin_url");

    /** Spotify */
    if (
      listeningFrom === "spotify" ||
      _get(listen, "track_metadata.additional_info.spotify_id")
    ) {
      selectedDatasourceIndex = this.dataSources.findIndex(
        (ds) => ds.current instanceof SpotifyPlayer
      );
    }

    /** Youtube */
    if (
      listeningFrom === "youtube" ||
      /youtube\.com\/watch\?/.test(originURL)
    ) {
      selectedDatasourceIndex = this.dataSources.findIndex(
        (ds) => ds.current instanceof YoutubePlayer
      );
    }

    /** If no matching datasource was found, revert to the default bahaviour */
    if (selectedDatasourceIndex === -1) {
      selectedDatasourceIndex = datasourceIndex;
    }

    this.setState({ currentDataSourceIndex: selectedDatasourceIndex }, () => {
      const { currentDataSourceIndex } = this.state;
      const dataSource =
        this.dataSources[currentDataSourceIndex] &&
        this.dataSources[currentDataSourceIndex].current;
      if (!dataSource) {
        this.invalidateDataSource();
        return;
      }

      dataSource.playListen(listen);
    });
  };

  togglePlay = async (): Promise<void> => {
    try {
      const { currentDataSourceIndex } = this.state;
      const dataSource =
        this.dataSources[currentDataSourceIndex] &&
        this.dataSources[currentDataSourceIndex].current;
      if (!dataSource) {
        this.invalidateDataSource();
        return;
      }
      await dataSource.togglePlay();
    } catch (error) {
      this.handleError(error.message);
    }
  };

  getCurrentTrackName = (): string => {
    const { currentListen } = this.props;
    return _get(currentListen, "track_metadata.track_name", "");
  };

  getCurrentTrackArtists = (): string | undefined => {
    const { currentListen } = this.props;
    return _get(currentListen, "track_metadata.artist_name", "");
  };

  seekToPositionMs = (msTimecode: number): void => {
    const { currentDataSourceIndex } = this.state;
    const dataSource =
      this.dataSources[currentDataSourceIndex] &&
      this.dataSources[currentDataSourceIndex].current;
    if (!dataSource) {
      this.invalidateDataSource();
      return;
    }
    dataSource.seekToPositionMs(msTimecode);
  };

  toggleDirection = (): void => {
    this.setState((prevState) => {
      const direction = prevState.direction === "down" ? "up" : "down";
      return { direction };
    });
  };

  /* Listeners for datasource events */

  failedToFindTrack = (): void => {
    const { currentListen } = this.props;
    if (!currentListen) {
      this.playNextTrack();
      return;
    }
    const { currentDataSourceIndex } = this.state;

    if (currentDataSourceIndex < this.dataSources.length - 1) {
      // Try playing the listen with the next dataSource
      this.playListen(currentListen, currentDataSourceIndex + 1);
    } else {
      this.handleWarning(
        "We couldn't find a matching song on any music service we tried",
        "Oh no !"
      );
      this.playNextTrack();
    }
  };

  playerPauseChange = (paused: boolean): void => {
    this.setState({ playerPaused: paused }, () => {
      if (paused) {
        this.stopPlayerStateTimer();
      } else {
        this.startPlayerStateTimer();
      }
    });
  };

  progressChange = (progressMs: number): void => {
    this.setState({ progressMs, updateTime: performance.now() });
  };

  durationChange = (durationMs: number): void => {
    this.setState({ durationMs }, this.startPlayerStateTimer);
  };

  trackInfoChange = (title: string, artist?: string): void => {
    this.setState({ currentTrackName: title, currentTrackArtist: artist });
  };

  /* Updating the progress bar without calling any API to check current player state */

  startPlayerStateTimer = (): void => {
    this.stopPlayerStateTimer();
    this.playerStateTimerID = setInterval(() => {
      this.getStatePosition();
    }, 200);
  };

  getStatePosition = (): void => {
    let newProgressMs: number;
    const { playerPaused, durationMs, progressMs, updateTime } = this.state;
    if (playerPaused) {
      newProgressMs = progressMs || 0;
    } else {
      const position = progressMs + (performance.now() - updateTime);
      newProgressMs = position > durationMs ? durationMs : position;
    }
    this.setState({ progressMs: newProgressMs, updateTime: performance.now() });
  };

  stopPlayerStateTimer = (): void => {
    if (this.playerStateTimerID) {
      clearInterval(this.playerStateTimerID);
    }
    this.playerStateTimerID = undefined;
  };

  render() {
    const {
      currentDataSourceIndex,
      currentTrackName,
      currentTrackArtist,
      playerPaused,
      direction,
      progressMs,
      durationMs,
    } = this.state;
    const { spotifyUser, apiService } = this.props;
    return (
      <div>
        <PlaybackControls
          playPreviousTrack={this.playPreviousTrack}
          playNextTrack={this.playNextTrack}
          togglePlay={this.firstRun ? this.playNextTrack : this.togglePlay}
          playerPaused={playerPaused}
          toggleDirection={this.toggleDirection}
          direction={direction}
          trackName={currentTrackName}
          artistName={currentTrackArtist}
          progressMs={progressMs}
          durationMs={durationMs}
          seekToPositionMs={this.seekToPositionMs}
        >
          <SpotifyPlayer
            show={
              this.dataSources[currentDataSourceIndex]?.current instanceof
              SpotifyPlayer
            }
            refreshSpotifyToken={apiService.refreshSpotifyToken}
            onInvalidateDataSource={this.invalidateDataSource}
            ref={this.spotifyPlayer}
            spotifyUser={spotifyUser}
            playerPaused={playerPaused}
            onPlayerPausedChange={this.playerPauseChange}
            onProgressChange={this.progressChange}
            onDurationChange={this.durationChange}
            onTrackInfoChange={this.trackInfoChange}
            onTrackEnd={this.playNextTrack}
            onTrackNotFound={this.failedToFindTrack}
            handleError={this.handleError}
            handleWarning={this.handleWarning}
            handleSuccess={this.handleSuccess}
          />
          <YoutubePlayer
            show={
              this.dataSources[currentDataSourceIndex]?.current instanceof
              YoutubePlayer
            }
            onInvalidateDataSource={this.invalidateDataSource}
            ref={this.youtubePlayer}
            playerPaused={playerPaused}
            onPlayerPausedChange={this.playerPauseChange}
            onProgressChange={this.progressChange}
            onDurationChange={this.durationChange}
            onTrackInfoChange={this.trackInfoChange}
            onTrackEnd={this.playNextTrack}
            onTrackNotFound={this.failedToFindTrack}
            handleError={this.handleError}
            handleWarning={this.handleWarning}
            handleSuccess={this.handleSuccess}
          />
        </PlaybackControls>
      </div>
    );
  }
}
