import * as ReactDOM from "react-dom";
import * as React from "react";
import LastFMImporter from "./LastFMImporter";

import ImporterModal from "./ImporterModal";

export type ImporterProps = {
  user: {
    id?: string;
    name: string;
    auth_token: string;
  };
  profileUrl?: string;
  apiUrl?: string;
  lastfmApiUrl: string;
  lastfmApiKey: string;
};

export type ImporterState = {
  show: boolean;
  canClose: boolean;
  lastfmUsername: string;
  msg: string;
};

export default class Importer extends React.Component<
  ImporterProps,
  ImporterState
> {
  importer: any;

  constructor(props: ImporterProps) {
    super(props);

    this.state = {
      show: false,
      canClose: true,
      lastfmUsername: "",
      msg: "",
    };
  }

  handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ lastfmUsername: event.target.value });
  };

  handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const { lastfmUsername } = this.state;
    this.toggleModal();
    event.preventDefault();
    this.importer = new LastFMImporter(lastfmUsername, this.props);
    setInterval(this.updateMessage, 100);
    setInterval(this.setClose, 100);
    this.importer.startImport();
  };

  toggleModal = () => {
    this.setState((prevState) => {
      return { show: !prevState.show };
    });
  };

  setClose = () => {
    this.setState({ canClose: this.importer.canClose });
  };

  updateMessage = () => {
    this.setState({ msg: this.importer.msg });
  };

  render() {
    const { show, canClose, lastfmUsername, msg } = this.state;

    return (
      <>
        <p>Most users will want to import from Last.fm directly.</p>
        <h3>Direct import from Last.fm</h3>
        <p>
          The Last.fm importer manually steps through your listen history and
          imports the listens one page at a time. Should it fail for whatever
          reason, it is safe to restart the import process. Running the import
          process multiple times <strong>does not</strong> create duplicates in
          your ListenBrainz listen history.
        </p>
        <p>
          In order for this to work, you must disable the &#34;Hide recent
          listening information&#34; setting in your Last.fm{" "}
          <a href="https://www.last.fm/settings/privacy">Privacy Settings</a>.
        </p>
        <p>
          Clicking the &quot;Import now!&qout; button will import your profile
          now without the need to open lastfm.
          <br />
          You need to keep this page open for the tool to work, it might take a
          while to complete. Though, you can continue doing your work. :)
        </p>
        <p>We need to know your Last.fm username:</p>
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

        <h3> Import from Spotify </h3>
        <p>
          ListenBrainz can automatically import songs from Spotify as you listen
          to them.
        </p>
        <p>
          Importing the same listens from two different sources such as Last.FM
          and Spotify may cause the creation of duplicates in your listen
          history. If you opt into our automatic Spotify import, please do not
          use the Last.FM import or submit listens from other ListenBrainz
          clients. This is a temporary limitation while we find better ways to
          deduplicate listens.
        </p>
        <p>
          <a href={`{window.location.origin}/profile/connect-spotify`}>
            Connect your Spotify account to ListenBrainz.
          </a>
        </p>
      </>
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const domContainer = document.querySelector("#react-container");
  const propsElement = document.getElementById("react-props");
  let reactProps;
  try {
    reactProps = JSON.parse(propsElement!.innerHTML);
  } catch (err) {
    // Show error to the user and ask to reload page
  }
  const {
    user,
    profile_url,
    api_url,
    lastfm_api_url,
    lastfm_api_key,
  } = reactProps;
  ReactDOM.render(
    <Importer
      user={user}
      profileUrl={profile_url}
      apiUrl={api_url}
      lastfmApiKey={lastfm_api_key}
      lastfmApiUrl={lastfm_api_url}
    />,
    domContainer
  );
});
