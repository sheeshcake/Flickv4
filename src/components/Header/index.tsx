import { View, Image, TouchableOpacity, StyleSheet } from 'react-native'
import React from 'react'
import { colors, sizes } from '../../constants/theme'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface HeaderProps {
    onPressCredits: () => void;
}

const Header: React.FC<HeaderProps> = ({
    onPressCredits
}) => {
  return (
    <View style={styles.container}>
        <Image
            source={require('../../assets/logo/logo.png')}
            style={styles.logo}
            resizeMode="contain"
        />
        <View style={styles.rightSection}>
            <TouchableOpacity
                onPress={onPressCredits}
                style={styles.button}
            >
                <Icon
                    name="information-outline"
                    size={sizes.width * 0.05}
                    color={colors.white}
                />
            </TouchableOpacity>
        </View>
    </View>
  )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'absolute',
        paddingTop: 20,
        top: 0,
        zIndex: 1,
        width: sizes.width,
        height: sizes.width * 0.20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between', 
        paddingHorizontal: sizes.width * 0.05,
        backgroundColor: colors.transparentBlack,
    },
    logo: {
        width: 70,
    },
    rightSection: {
        flex: 1,
        alignItems: 'center',
        width: '100%',
        justifyContent: 'flex-end',
        flexDirection: 'row',
    },
    button: {
        padding: 10,
    }
});

export default Header