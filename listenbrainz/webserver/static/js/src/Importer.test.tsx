import * as React from "react";
import { mount, shallow } from "enzyme";

import Importer from "./Importer";

const props = {
  user: {
    id: "id",
    name: "dummyUser",
    auth_token: "foobar",
  },
  profileUrl: "http://profile",
  apiUrl: "apiUrl",
  lastfmApiUrl: "http://ws.audioscrobbler.com/2.0/",
  lastfmApiKey: "foobar",
};

describe("Importer page", () => {
  it("renders", () => {
    const wrapper = mount(<Importer {...props} />);
    expect(wrapper.html()).toMatchSnapshot();
  });

  it("modal renders when button clicked", () => {
    const wrapper = shallow(<Importer {...props} />);
    // Simulate submiting the form
    wrapper.find("form").simulate("submit", {
      preventDefault: () => null,
    });

    // Test if the show property has been set to true
    expect(wrapper.exists("ImporterModal")).toBe(true);
  });

  it("submit button is disabled when input is empty", () => {
    const wrapper = shallow(<Importer {...props} />);
    // Make sure that the input is empty
    wrapper.setState({ lastfmUsername: "" });

    // Test if button is disabled
    expect(wrapper.find('input[type="submit"]').props().disabled).toBe(true);
  });
});
