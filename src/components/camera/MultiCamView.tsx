import React, {RefObject, useMemo} from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';
import {
  Camera,
  CameraDevice,
  CameraProps,
  useCameraDevices,
} from 'react-native-vision-camera';

type PipAnchor = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface MultiCamViewProps {
  backCameraRef?: RefObject<Camera>;
  backDeviceOverride?: CameraDevice | null;
  frontCameraRef?: RefObject<Camera>;
  frontDeviceOverride?: CameraDevice | null;
  cameraProps?: Partial<CameraProps>;
  isActive?: boolean;
  pipAnchor?: PipAnchor;
  pipStyle?: ViewStyle;
  /** Size of the PiP surface in pixels */
  pipSize?: {width: number; height: number};
  style?: ViewStyle;
}

const DEFAULT_PIP_SIZE = {width: 160, height: 240};

const anchorStyles: Record<PipAnchor, ViewStyle> = {
  'bottom-left': {left: 20, bottom: 20},
  'bottom-right': {right: 20, bottom: 20},
  'top-left': {left: 20, top: 20},
  'top-right': {right: 20, top: 20},
};

/**
 * MultiCamView renders simultaneous back + front camera feeds with a PiP overlay.
 * Designed for documenting IRL finds while keeping the user's reaction visible.
 */
const MultiCamView: React.FC<MultiCamViewProps> = ({
  backCameraRef,
  backDeviceOverride,
  frontDeviceOverride,
  frontCameraRef,
  cameraProps,
  isActive = true,
  pipAnchor = 'bottom-left',
  pipStyle,
  pipSize = DEFAULT_PIP_SIZE,
  style,
}) => {
  const devices = useCameraDevices();

  const backDevice = useMemo<CameraDevice | null>(() => {
    if (backDeviceOverride === null) {
      return null;
    }
    return backDeviceOverride ?? devices.dualCamera ?? devices.back ?? null;
  }, [backDeviceOverride, devices.back, devices.dualCamera]);

  const frontDevice = useMemo<CameraDevice | null>(() => {
    if (frontDeviceOverride === null) {
      return null;
    }
    return frontDeviceOverride ?? devices.front ?? null;
  }, [devices.front, frontDeviceOverride]);

  const sharedCameraProps = useMemo(() => {
    if (!cameraProps) {
      return {};
    }
    const {
      device: _device,
      isActive: _isActive,
      style: _style,
      ...rest
    } = cameraProps;
    return rest;
  }, [cameraProps]);

  if (!backDevice) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={backCameraRef}
        style={StyleSheet.absoluteFill}
        device={backDevice}
        isActive={isActive}
        {...sharedCameraProps}
      />
      {frontDevice ? (
        <View
          style={[
            styles.pipContainer,
            {width: pipSize.width, height: pipSize.height},
            anchorStyles[pipAnchor],
            pipStyle,
          ]}
        >
          <Camera
            ref={frontCameraRef}
            style={styles.pipCamera}
            device={frontDevice}
            isActive={isActive}
            {...sharedCameraProps}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  pipContainer: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pipCamera: {
    flex: 1,
  },
});

export default MultiCamView;

