import { StyleSheet, Text, View } from 'react-native';

export default function FoundationScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Finova</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#08111A',
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#F7FAFC',
    fontSize: 32,
    fontWeight: '700',
  },
});
