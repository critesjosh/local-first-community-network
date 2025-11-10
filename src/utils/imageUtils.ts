/**
 * Image utility functions for profile photos
 * Handles compression, resizing, and conversion for BLE transfer
 */

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Target size for profile images (keep small for BLE transfer)
const MAX_IMAGE_SIZE = 200; // 200x200 pixels
const JPEG_QUALITY = 0.7; // 70% quality

export interface ImageResult {
  base64: string;
  uri: string;
  width: number;
  height: number;
}

/**
 * Pick an image from the device's library
 */
export async function pickProfileImage(): Promise<ImageResult | null> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Permission to access photos was denied');
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square crop
      quality: 1, // Max quality for initial pick (we'll compress after)
      base64: false, // We'll get base64 after manipulation
    });

    if (result.canceled) {
      return null;
    }

    // Process the image
    return await processImage(result.assets[0].uri);
  } catch (error) {
    console.error('[ImageUtils] Error picking image:', error);
    throw error;
  }
}

/**
 * Take a photo with the camera
 */
export async function takeProfilePhoto(): Promise<ImageResult | null> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Permission to access camera was denied');
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1], // Square crop
      quality: 1,
      base64: false,
    });

    if (result.canceled) {
      return null;
    }

    // Process the image
    return await processImage(result.assets[0].uri);
  } catch (error) {
    console.error('[ImageUtils] Error taking photo:', error);
    throw error;
  }
}

/**
 * Process an image: resize, compress, and convert to base64
 */
async function processImage(uri: string): Promise<ImageResult> {
  try {
    // Resize and compress the image
    const manipulatedImage = await manipulateAsync(
      uri,
      [
        {
          resize: {
            width: MAX_IMAGE_SIZE,
            height: MAX_IMAGE_SIZE,
          },
        },
      ],
      {
        compress: JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true, // Get base64 output
      }
    );

    if (!manipulatedImage.base64) {
      throw new Error('Failed to convert image to base64');
    }

    return {
      base64: manipulatedImage.base64,
      uri: manipulatedImage.uri,
      width: manipulatedImage.width,
      height: manipulatedImage.height,
    };
  } catch (error) {
    console.error('[ImageUtils] Error processing image:', error);
    throw error;
  }
}

/**
 * Convert base64 string to data URI for React Native Image component
 */
export function base64ToDataUri(base64: string): string {
  // If it already has the data URI prefix, return as-is
  if (base64.startsWith('data:')) {
    return base64;
  }
  
  // Add data URI prefix
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Estimate the size of a base64 string in KB
 */
export function getBase64SizeKB(base64: string): number {
  // Remove data URI prefix if present
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  
  // Base64 encoding increases size by ~33%
  // Actual bytes = (base64 length * 3) / 4
  const bytes = (cleanBase64.length * 3) / 4;
  return bytes / 1024;
}

/**
 * Validate that an image is within acceptable size limits for BLE transfer
 * Returns true if valid, throws error if too large
 */
export function validateImageSize(base64: string, maxSizeKB: number = 100): boolean {
  const sizeKB = getBase64SizeKB(base64);
  
  if (sizeKB > maxSizeKB) {
    throw new Error(
      `Image too large (${sizeKB.toFixed(1)}KB). Must be under ${maxSizeKB}KB for BLE transfer.`
    );
  }
  
  return true;
}
