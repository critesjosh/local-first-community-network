import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {IrlItem} from '../../types/models';

export interface IrlItemCardProps {
  item: IrlItem;
  onPress?: (item: IrlItem) => void;
  style?: ViewStyle;
  variant?: 'large' | 'small';
}

const fallbackUri = (item: IrlItem): string => {
  if (item.thumbnailUri) {
    return item.thumbnailUri;
  }
  if (item.frontCameraUri) {
    return item.frontCameraUri;
  }
  return item.mediaUri;
};

const IrlItemCard: React.FC<IrlItemCardProps> = ({
  item,
  onPress,
  style,
  variant = 'small',
}) => {
  const photoUri = fallbackUri(item);
  const tags = item.tags ?? [];
  const Container = onPress ? TouchableOpacity : View;

  const containerStyle =
    variant === 'large' ? styles.largeCardContainer : styles.cardContainer;
  const imageStyle = variant === 'large' ? styles.largeImage : styles.image;

  return (
    <Container
      style={[containerStyle, style]}
      onPress={onPress ? () => onPress(item) : undefined}
      activeOpacity={0.8}
    >
      <Image source={{uri: photoUri}} style={imageStyle} />
      <View style={styles.meta}>
        {item.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {item.caption}
          </Text>
        ) : null}
        <Text style={styles.timestamp}>
          {item.capturedAt.toLocaleDateString()} ·{' '}
          {item.capturedAt.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.slice(0, 3).map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
            {tags.length > 3 ? (
              <View style={styles.tagChip}>
                <Text style={styles.tagText}>+{tags.length - 3}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 16,
    shadowColor: '#171717',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  largeCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#171717',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
    elevation: 5,
  },
  image: {
    width: '100%',
    height: 160,
  },
  largeImage: {
    width: '100%',
    height: 220,
  },
  meta: {
    padding: 12,
    gap: 6,
  },
  caption: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 11,
    color: '#3E4ACC',
    fontWeight: '600',
  },
});

export default IrlItemCard;

