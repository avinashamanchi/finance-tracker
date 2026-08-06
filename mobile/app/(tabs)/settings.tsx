import { Text } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { colors } from '../../src/design/tokens';

export default function SettingsRoute() { return <Screen><Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>Settings</Text></Screen>; }
