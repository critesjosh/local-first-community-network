import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Camera, CameraPermissionStatus} from 'react-native-vision-camera';
import MultiCamView from '../components/camera/MultiCamView';
import ConnectionService from '../services/ConnectionService';
import ItemStorageService from '../services/storage/ItemStorageService';
import {Connection, IrlItem} from '../types/models';
import {generateUUID} from '../utils/crypto';
import {RootStackScreenProps} from '../types/navigation';

type Props = RootStackScreenProps<'IrlItemCapture'>;

const IrlItemCaptureScreen: React.FC<Props> = ({navigation, route}) => {
  const backCameraRef = useRef<Camera>(null);
  const frontCameraRef = useRef<Camera>(null);

  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionStatus>('not-determined');
  const [microphonePermission, setMicrophonePermission] =
    useState<CameraPermissionStatus>('not-determined');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>(
    [],
  );
  const [caption, setCaption] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUris, setPreviewUris] = useState<{
    back: string;
    front?: string;
  } | null>(null);

  const routePrefill = route.params?.connectionId;

  useEffect(() => {
    const requestPermissions = async () => {
      const cameraStatus = await Camera.requestCameraPermission();
      const micStatus = await Camera.requestMicrophonePermission();
      setCameraPermission(cameraStatus);
      setMicrophonePermission(micStatus);
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadConnections = async () => {
      const items = await ConnectionService.getConnections();
      if (mounted) {
        setConnections(items);
        if (routePrefill && items.some(c => c.id === routePrefill)) {
          setSelectedConnectionIds(ids => {
            if (ids.includes(routePrefill)) {
              return ids;
            }
            return [...ids, routePrefill];
          });
        }
      }
    };

    loadConnections();

    return () => {
      mounted = false;
    };
  }, [routePrefill]);

  const permissionGranted = useMemo(() => {
    return (
      cameraPermission === 'authorized' && microphonePermission === 'authorized'
    );
  }, [cameraPermission, microphonePermission]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const toggleConnection = useCallback(
    (connectionId: string) => {
      setSelectedConnectionIds(prev => {
        if (prev.includes(connectionId)) {
          return prev.filter(id => id !== connectionId);
        }
        return [...prev, connectionId];
      });
    },
    [setSelectedConnectionIds],
  );

  const handleCapture = useCallback(async () => {
    if (!backCameraRef.current) {
      Alert.alert('Camera not ready', 'Back camera is not available yet.');
      return;
    }

    setCapturing(true);
    try {
      const [backPhoto, frontPhoto] = await Promise.all([
        backCameraRef.current.takePhoto({
          qualityPrioritization: 'quality',
        }),
        frontCameraRef.current
          ? frontCameraRef.current.takePhoto({
              qualityPrioritization: 'speed',
            })
          : Promise.resolve(null),
      ]);

      if (!backPhoto?.path) {
        throw new Error('Failed to capture back camera photo');
      }

      setPreviewUris({
        back: backPhoto.path.startsWith('file://')
          ? backPhoto.path
          : `file://${backPhoto.path}`,
        front: frontPhoto?.path
          ? frontPhoto.path.startsWith('file://')
            ? frontPhoto.path
            : `file://${frontPhoto.path}`
          : undefined,
      });
    } catch (error) {
      console.error('[IrlItemCaptureScreen] Error capturing photos', error);
      Alert.alert('Capture failed', 'Unable to capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, []);

  const parsedTags = useMemo(() => {
    return tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }, [tagsInput]);

  const handleSave = useCallback(async () => {
    if (!previewUris) {
      Alert.alert('No capture yet', 'Take a photo before saving.');
      return;
    }

    setSaving(true);
    try {
      await ItemStorageService.saveItem({
        id: generateUUID(),
        mediaUri: previewUris.back,
        frontCameraUri: previewUris.front,
        capturedAt: new Date(),
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        caption: caption || undefined,
        connectionIds: selectedConnectionIds,
      } as IrlItem);

      Alert.alert('Saved', 'Your IRL find has been saved locally.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('[IrlItemCaptureScreen] Error saving IRL item', error);
      Alert.alert('Save failed', 'Unable to save the captured item. Try again.');
    } finally {
      setSaving(false);
    }
  }, [
    caption,
    navigation,
    parsedTags,
    previewUris,
    selectedConnectionIds,
  ]);

  const handleRetake = useCallback(() => {
    setPreviewUris(null);
  }, []);

  const renderPermissionGate = () => (
    <View style={styles.permissionContainer}>
      <Text style={styles.permissionTitle}>Camera Access Needed</Text>
      <Text style={styles.permissionText}>
        Grant camera and microphone permissions to record IRL finds with
        picture-in-picture.
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={handleOpenSettings}>
        <Text style={styles.permissionButtonText}>Open Settings</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log IRL Find</Text>
        <View style={{width: 60}} />
      </View>

      <View style={styles.cameraContainer}>
        {permissionGranted ? (
          <MultiCamView
            backCameraRef={backCameraRef}
            frontCameraRef={frontCameraRef}
            isActive={!capturing}
            pipAnchor="bottom-left"
            pipSize={{width: 140, height: 200}}
            pipStyle={styles.pipStyle}
            cameraProps={{photo: true}}
          />
        ) : (
          renderPermissionGate()
        )}
        {capturing ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.metaContainer} contentContainerStyle={styles.metaContent}>
        {previewUris ? (
          <View style={styles.previewRow}>
            <Image source={{uri: previewUris.back}} style={styles.previewImage} />
            {previewUris.front ? (
              <Image source={{uri: previewUris.front}} style={styles.previewImageSmall} />
            ) : null}
          </View>
        ) : (
          <Text style={styles.hintText}>
            Capture both sides of the moment. Your neighbors will see the items you collect
            when you decide to share.
          </Text>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Caption</Text>
          <TextInput
            style={styles.textInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add context or a memory"
            placeholderTextColor="#8E8E93"
            multiline
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Tags</Text>
          <TextInput
            style={styles.textInput}
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder="e.g. community garden, trade"
            placeholderTextColor="#8E8E93"
          />
          <Text style={styles.helperText}>Separate tags with commas.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Link to Connections</Text>
          {connections.length === 0 ? (
            <Text style={styles.helperText}>
              Make a connection first to link this find to someone nearby.
            </Text>
          ) : (
            <View style={styles.connectionList}>
              {connections.map(connection => {
                const isSelected = selectedConnectionIds.includes(connection.id);
                return (
                  <TouchableOpacity
                    key={connection.id}
                    style={[
                      styles.connectionChip,
                      isSelected && styles.connectionChipSelected,
                    ]}
                    onPress={() => toggleConnection(connection.id)}
                  >
                    <Text
                      style={[
                        styles.connectionChipText,
                        isSelected && styles.connectionChipTextSelected,
                      ]}
                    >
                      {connection.displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {previewUris ? (
          <TouchableOpacity
            style={[styles.footerButton, styles.retakeButton]}
            onPress={handleRetake}
            disabled={saving}
          >
            <Text style={styles.footerButtonText}>Retake</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.footerButton, styles.captureButton]}
            onPress={handleCapture}
            disabled={capturing || !permissionGranted}
          >
            <Text style={styles.footerButtonText}>Capture</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.footerButton,
            styles.saveButton,
            (!previewUris || saving) && styles.footerButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!previewUris || saving}
        >
          <Text style={styles.footerButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cancelButton: {
    color: '#FFFFFF',
    fontSize: 17,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  cameraContainer: {
    height: 320,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pipStyle: {
    borderRadius: 16,
  },
  metaContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  metaContent: {
    padding: 20,
    paddingBottom: 120,
  },
  hintText: {
    color: '#8E8E93',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
    backgroundColor: '#F9F9FB',
  },
  helperText: {
    marginTop: 6,
    fontSize: 13,
    color: '#8E8E93',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#0B0B0F',
    gap: 12,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  captureButton: {
    backgroundColor: '#007AFF',
  },
  retakeButton: {
    backgroundColor: '#5E5CE6',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  previewImage: {
    width: 160,
    height: 240,
    borderRadius: 12,
  },
  previewImageSmall: {
    width: 100,
    height: 150,
    borderRadius: 12,
  },
  connectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  connectionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
  },
  connectionChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  connectionChipText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '500',
  },
  connectionChipTextSelected: {
    color: '#FFFFFF',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    color: '#D1D1D6',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default IrlItemCaptureScreen;

