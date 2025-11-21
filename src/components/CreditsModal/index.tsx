import { View, Text, Modal, Image, TouchableOpacity, ScrollView, Linking, StyleSheet } from 'react-native'
import React, { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, sizes } from '../../constants/theme';

interface CreditsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {

    const [yosi, setYosi] = useState(0);
    
    const getYosi = async () => {
        try{
            const storedYosi = await AsyncStorage.getItem('yosi');
            if(storedYosi !== null) {
                setYosi(parseInt(storedYosi, 10));
            } else {
                await AsyncStorage.setItem('yosi', '0');
            }
        } catch {
            setYosi(0);
        }
    }

    useEffect(() => {
        getYosi();
    }, []);


    const addYosi = async () => {
        setYosi(yosi + 1);
        await AsyncStorage.setItem('yosi', `${yosi + 1}`);
    }


    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isOpen}
            style={styles.modal}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Image
                        source={require('../../assets/logo/logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.versionText}>1.0.1</Text>
                    <ScrollView>
                        <Text style={styles.sectionTitle}>
                            What is Flick?
                        </Text>
                        <Text style={styles.descriptionText}>
                            Flick (v4) is a Free Movie Streaming and Download app, no ads, no accounts, no bullshits, just free!.
                            {'\n\n'}
                            Watch and Download Free movies and TV Shows, HD movies directly on your mobile device.
                            {'\n\n'}
                        </Text>
                        <Text style={styles.sectionTitle}>
                            Credits
                        </Text>
                        <Text style={styles.creditsText}>
                            Main Developers{'\n'}
                            ----------------
                            {'\n'}
                            Wendale Dy{'\n'}(https://github.com/sheeshcake) {'\n'}for making this shit (UI/UX, Main Features, Scrapper Maintenance)
                            {'\n\n'}
                            ----------------
                            {'\n\n'}
                        </Text>
                        <Text style={styles.sectionTitle}>
                            Disclaimer
                        </Text>
                        <Text style={styles.disclaimerText}>
                            Any legal issues regarding the content on this application should be taken up with the actual file hosts and providers themselves as we are not affiliated with them. In case of copyright infringement, please directly contact the responsible parties or the streaming websites. The app is purely for educational and personal use. Flick(v4) does not host any content on the app, and has no control over what media is put up or taken down. Flick(v4) functions like any other search engine, such as Google. Flick(v4) does not host, upload or manage any videos, films or content. It simply crawls, aggregates and displayes links in a convenient, user-friendly interface. It merely scrapes 3rd-party websites that are publicly accessable via any regular web browser. It is the responsibility of user to avoid any actions that might violate the laws governing his/her locality. Use Flick(v4) at your own risk.
                        </Text>
                    </ScrollView>
                    <TouchableOpacity
                        style={styles.yosiButton}
                        onPress={addYosi}
                    >
                        <Text style={styles.buttonText}>({yosi}x)Send a Yosi to devs 🚬</Text>
                    </TouchableOpacity>
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={styles.coffeeButton}
                            onPress={() => Linking.openURL("https://www.paypal.com/paypalme/wfrdee")}
                        >
                            <Text style={styles.buttonText}>Buy Me a Coffee☕</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onClose}
                        >
                            <Text style={styles.buttonText}>
                                Close
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    )
}

const styles = StyleSheet.create({
    modal: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    modalContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 22,
        maxHeight: sizes.height * 0.9
    },
    modalContent: {
        margin: 20,
        backgroundColor: colors.black,
        borderRadius: 20,
        padding: 35,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5
    },
    logo: {
        width: 100,
        height: 50
    },
    versionText: {
        color: colors.white,
        marginBottom: 20
    },
    sectionTitle: {
        color: colors.white,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    descriptionText: {
        marginBottom: 50,
        fontSize: 19,
        color: colors.white,
    },
    creditsText: {
        marginBottom: 50,
        fontSize: 19,
        textAlign: 'center',
        color: colors.white,
    },
    disclaimerText: {
        fontSize: 19,
        color: colors.white,
    },
    yosiButton: {
        padding: 10,
        marginTop: 20,
        borderRadius: 5,
        backgroundColor: colors.white
    },
    buttonContainer: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    coffeeButton: {
        padding: 10,
        marginRight: 10,
        borderRadius: 5,
        backgroundColor: colors.white
    },
    closeButton: {
        padding: 10,
        borderRadius: 5,
        backgroundColor: colors.white
    },
    buttonText: {
        color: colors.black,
        fontSize: 20,
        fontWeight: 'bold'
    }
});

export default CreditsModal