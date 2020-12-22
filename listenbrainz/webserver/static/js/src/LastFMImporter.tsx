import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faCheck, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as React from "react";

import APIService from "./APIService";
import { ImporterProps } from "./Importer";
import ImporterModal from "./ImporterModal";
import Scrobble from "./Scrobble";

type LastFMImporterState = {
  show: boolean;
  canClose: boolean;
  lastfmUsername: string;
  msg: JSX.Element | string;
};

export default class LastFMImporter extends React.Component<
  ImporterProps,
  LastFMImporterState
> {
  static encodeScrobbles(scrobbles: LastFmScrobblePage): any {
    const rawScrobbles = scrobbles.recenttracks.track;
    const parsedScrobbles = LastFMImporter.map((rawScrobble: any) => {
      const scrobble = new Scrobble(rawScrobble);
      return scrobble.asJSONSerializable();
    }, rawScrobbles);
    return parsedScrobbles;
  }

  static map(applicable: (collection: any) => Listen, collection: any) {
    const newCollection = [];
    for (let i = 0; i < collection.length; i += 1) {
      const result = applicable(collection[i]);
      if (result.listened_at > 0) {
        // If the 'listened_at' attribute is -1 then either the listen is invalid or the
        // listen is currently playing. In both cases we need to skip the submission.
        newCollection.push(result);
      }
    }
    return newCollection;
  }

  APIService: APIService;

  private page = 1;
  private totalPages = 0;

  private playCount = -1; // the number of scrobbles reported by Last.FM
  private countReceived = 0; // number of scrobbles the Last.FM API sends us, this can be diff from playCount

  private latestImportTime = 0; // the latest timestamp that we've imported earlier
  private maxTimestampForImport = 0; // the latest listen found in this import
  private incrementalImport = false;

  private numCompleted = 0; // number of pages completed till now

  // Variables used to honor LB's rate limit
  private rlRemain = -1;
  private rlReset = -1;
  private rlOrigin = -1;

  constructor(props: ImporterProps) {
    super(props);

    this.APIService = new APIService(
      props.apiUrl || `${window.location.origin}/1`
    ); // Used to access LB API

    this.state = {
      show: false,
      canClose: true,
      lastfmUsername: "",
      msg: "",
    };
  }

  async getTotalNumberOfScrobbles() {
    /*
     * Get the total play count reported by Last.FM for user
     */
    const { lastfmApiUrl, lastfmApiKey } = this.props;
    const { lastfmUsername } = this.state;

    const url = `${lastfmApiUrl}?method=user.getinfo&user=${lastfmUsername}&api_key=${lastfmApiKey}&format=json`;
    try {
      const response = await fetch(encodeURI(url));
      const data = await response.json();
      if ("playcount" in data.user) {
        return Number(data.user.playcount);
      }
      return -1;
    } catch {
      this.setState({
        msg: (
          <p>
            Could not get total number of Listens to import, please try again
            later.
          </p>
        ),
        canClose: true,
      });
      const error = new Error();
      error.message = "Something went wrong";
      throw error;
    }
  }

  async getNumberOfPages() {
    /*
     * Get the total pages of data from last import
     */

    const { lastfmApiUrl, lastfmApiKey } = this.props;
    const { lastfmUsername } = this.state;
    const url = `${lastfmApiUrl}?method=user.getrecenttracks&user=${lastfmUsername}&api_key=${lastfmApiKey}&from=${
      this.latestImportTime + 1
    }&format=json`;
    try {
      const response = await fetch(encodeURI(url));
      const data = await response.json();
      if ("recenttracks" in data) {
        return Number(data.recenttracks["@attr"].totalPages);
      }
      return 0;
    } catch (error) {
      this.setState({
        msg: (
          <p>
            Could not fetch the total number of Pages to import, please try
            again later.
          </p>
        ),
        canClose: true,
      });
      return -1;
    }
  }

  async getPage(page: number) {
    /*
     * Fetch page from Last.fm
     */

    const { lastfmApiUrl: lastfmURL, lastfmApiKey: lastfmKey } = this.props;
    const { lastfmUsername } = this.state;

    const retry = () => {
      // console.warn(`${reason} while fetching last.fm page=${page}, retrying in 3s`);
      this.setState({
        msg: `Failed to fetch page ${page}, retrying.`,
      });
      setTimeout(() => this.getPage(page), 3000);
    };

    const url = `${lastfmURL}?method=user.getrecenttracks&user=${lastfmUsername}&api_key=${lastfmKey}&from=${
      this.latestImportTime + 1
    }&page=${page}&format=json`;
    try {
      const response = await fetch(encodeURI(url));
      if (response.ok) {
        const data = await response.json();
        // Set latest import time
        if ("date" in data.recenttracks.track[0]) {
          this.maxTimestampForImport = Math.max(
            data.recenttracks.track[0].date.uts,
            this.maxTimestampForImport
          );
        } else {
          this.maxTimestampForImport = Math.floor(Date.now() / 1000);
        }

        // Encode the page so that it can be submitted
        const payload = LastFMImporter.encodeScrobbles(data);
        this.countReceived += payload.length;
        return payload;
      }
      if (/^5/.test(response.status.toString())) {
        retry();
      } else {
        // ignore 40x
        // console.warn(`Got ${response.status} while fetching page last.fm page=${page}, skipping`);
      }
    } catch {
      // Retry if there is a network error
      retry();
    }

    return null;
  }

  getRateLimitDelay() {
    /* Get the amount of time we should wait according to LB rate limits before making a request to LB */
    let delay = 0;
    const current = new Date().getTime() / 1000;
    if (this.rlReset < 0 || current > this.rlOrigin + this.rlReset) {
      delay = 0;
    } else if (this.rlRemain > 0) {
      delay = Math.max(0, Math.ceil((this.rlReset * 1000) / this.rlRemain));
    } else {
      delay = Math.max(0, Math.ceil(this.rlReset * 1000));
    }
    return delay;
  }

  handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ lastfmUsername: event.target.value });
  };

  handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    this.toggleModal();
    event.preventDefault();
    this.startImport();
  };

  toggleModal = () => {
    this.setState(({ show }: { show: boolean }) => {
      return { show: !show };
    });
  };

  async startImport() {
    const {
      profileUrl,
      user: { name: userName, auth_token: userToken },
    } = this.props;

    this.setState({
      canClose: false,
      msg: <p>Your import from Last.fm is starting!</p>,
    });
    this.playCount = await this.getTotalNumberOfScrobbles();
    this.latestImportTime = await this.APIService.getLatestImport(userName);
    this.incrementalImport = this.latestImportTime > 0;
    this.totalPages = await this.getNumberOfPages();
    this.page = this.totalPages; // Start from the last page so that oldest scrobbles are imported first

    while (this.page > 0) {
      // Fixing no-await-in-loop will require significant changes to the code, ignoring for now
      const payload = await this.getPage(this.page); // eslint-disable-line
      if (payload) {
        // Submit only if response is valid
        this.submitPage(payload);
      }

      this.page -= 1;
      this.numCompleted += 1;

      // Update message
      const msg = (
        <p>
          <FontAwesomeIcon icon={faSpinner as IconProp} spin /> Sending page{" "}
          {this.numCompleted} of {this.totalPages} to ListenBrainz <br />
          <span style={{ fontSize: `${8}pt` }}>
            {this.incrementalImport && (
              <span>
                Note: This import will stop at the starting point of your last
                import. :)
                <br />
              </span>
            )}
            <span>Please don&apos;t close this page while this is running</span>
          </span>
        </p>
      );

      this.setState({ msg });
    }

    // Update latest import time on LB server
    try {
      this.maxTimestampForImport = Math.max(
        Number(this.maxTimestampForImport),
        this.latestImportTime
      );
      this.APIService.setLatestImport(userToken, this.maxTimestampForImport);
    } catch {
      // console.warn("Error setting latest import timestamp, retrying in 3s");
      setTimeout(
        () =>
          this.APIService.setLatestImport(
            userToken,
            this.maxTimestampForImport
          ),
        3000
      );
    }
    const finalMsg = (
      <p>
        <FontAwesomeIcon icon={faCheck as IconProp} /> Import finished
        <br />
        <span style={{ fontSize: `${8}pt` }}>
          Successfully submitted {this.countReceived} listens to ListenBrainz
          <br />
        </span>
        {/* if the count received is different from the api count, show a message accordingly
         * also don't show this message if it's an incremental import, because countReceived
         * and playCount will be different by definition in incremental imports
         */}
        {!this.incrementalImport &&
          this.playCount !== -1 &&
          this.countReceived !== this.playCount && (
            <b>
              <span style={{ fontSize: `${10}pt` }} className="text-danger">
                The number submitted listens is different from the{" "}
                {this.playCount} that Last.fm reports due to an inconsistency in
                their API, sorry!
                <br />
              </span>
            </b>
          )}
        <span style={{ fontSize: `${8}pt` }}>
          Thank you for using ListenBrainz!
        </span>
        <br />
        <br />
        <span style={{ fontSize: `${10}pt` }}>
          <a href={profileUrl}>Close and go to your ListenBrainz profile</a>
        </span>
      </p>
    );

    this.setState({
      msg: finalMsg,
      canClose: true,
    });
  }

  async submitPage(payload: Array<Listen>) {
    const delay = this.getRateLimitDelay();
    // Halt execution for some time
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });

    const {
      user: { auth_token: userToken },
    } = this.props;

    const response = await this.APIService.submitListens(
      userToken,
      "import",
      payload
    );
    this.updateRateLimitParameters(response);
  }

  updateRateLimitParameters(response: Response) {
    /* Update the variables we use to honor LB's rate limits */
    this.rlRemain = Number(response.headers.get("X-RateLimit-Remaining"));
    this.rlReset = Number(response.headers.get("X-RateLimit-Reset-In"));
    this.rlOrigin = new Date().getTime() / 1000;
  }

  render() {
    const { show, canClose, lastfmUsername, msg } = this.state;

    return (
      <div className="well">
        <div className="Importer">
          <form onSubmit={this.handleSubmit}>
            <input
              type="text"
              onChange={this.handleChange}
              value={lastfmUsername}
              placeholder="Last.fm Username"
              size={30}
            />
            <input
              type="submit"
              value="Import Now!"
              disabled={!lastfmUsername}
            />
          </form>
          {show && (
            <ImporterModal onClose={this.toggleModal} disable={!canClose}>
              <img
                src="/static/img/listenbrainz-logo.svg"
                height="75"
                className="img-responsive"
                alt=""
              />
              <br />
              <br />
              <div>{msg}</div>
              <br />
            </ImporterModal>
          )}
        </div>
      </div>
    );
  }
}
