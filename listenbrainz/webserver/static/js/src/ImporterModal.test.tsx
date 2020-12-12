import * as React from "react";
import { mount, shallow } from "enzyme";

import ImporterModal from "./ImporterModal";

const props = {
  disable: false,
  children: [],
  onClose: (event: React.MouseEvent<HTMLButtonElement>) => {},
};

describe("ImporterModal", () => {
  it("renders", () => {
    const wrapper = mount(<ImporterModal {...props} />);
    expect(wrapper.html()).toMatchSnapshot();
  });

  it("close button is disabled/enabled based upon props", () => {
    const wrapper = shallow(<ImporterModal {...props} />);
    // Test if close button is disabled
    wrapper.setProps({ disable: true });
    expect(wrapper.find("button").props().disabled).toBe(true);

    // Test if close button is enabled
    wrapper.setProps({ disable: false });
    expect(wrapper.find("button").props().disabled).toBe(false);
  });
});
