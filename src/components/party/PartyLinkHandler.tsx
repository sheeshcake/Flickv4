import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { parsePartyCodeFromUrl } from '@/src/party/protocol';
import type { RootStackParamList } from '@/src/navigation/types';

/**
 * Opens JoinParty when the app is launched (or foregrounded) via
 * `flick://party/CODE` or `com.wfrdee.flick://party/CODE`.
 */
export const PartyLinkHandler = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const code = parsePartyCodeFromUrl(url);
      if (!code) return;
      const state = navigation.getState();
      const current = state?.routes[state.index]?.name;
      if (!current || current === 'Splash') {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Main' },
            { name: 'JoinParty', params: { code } },
          ],
        });
        return;
      }
      navigation.navigate('JoinParty', { code });
    };

    void Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', (event) => open(event.url));
    return () => sub.remove();
  }, [navigation]);

  return null;
};
