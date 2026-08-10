import { render } from '@testing-library/react-native';
import PrivacyScreen from '../src/screens/PrivacyScreen';
import SupportScreen from '../src/screens/SupportScreen';

describe('policy and support content', () => {
  it('states local storage, explicit sharing, backup restoration, and data exclusions', async () => {
    const view = await render(<PrivacyScreen />);
    expect(view.getByText(/stays on this device/i)).toBeTruthy();
    expect(view.getByText(/unless you explicitly export or share/i)).toBeTruthy();
    expect(view.getByText(/existing device backup may restore data/i)).toBeTruthy();
    expect(view.getByText(/no account, bank connection, ads, tracking, or behavioral product-usage analytics/i)).toBeTruthy();
    expect(view.getByText(/RevenueCat receives a random anonymous app user identifier/i)).toBeTruthy();
  });

  it('states calculation and advice limits in support', async () => {
    const view = await render(<SupportScreen />);
    expect(view.getByText(/not financial, tax, legal, credit, or investment advice/i)).toBeTruthy();
    expect(view.getByText(/missing or incorrect entries/i)).toBeTruthy();
    expect(view.getByText(/cannot recover deleted data/i)).toBeTruthy();
  });
});
