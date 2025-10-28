import React from 'react';
import {View, Text, StyleSheet, Image, TouchableOpacity, Alert} from 'react-native';
import {Event} from '../../types/models';

interface EventCardProps {
  event: Event;
  authorName: string;
  authorPhoto?: string;
  onPress?: () => void;
  onRSVP?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
  currentUserRSVP?: 'going' | 'interested' | 'not_going';
  attendeeCount?: number;
  onViewReplies?: (eventId: string) => void;
  replyCount?: number;
  onDelete?: (eventId: string) => void;
  isOwnPost?: boolean;
}

const EventCard: React.FC<EventCardProps> = ({
  event,
  authorName,
  authorPhoto,
  onPress,
  onViewReplies,
  replyCount,
  onDelete,
  isOwnPost,
}) => {
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const eventDate = new Date(date);
    const diffInMs = now.getTime() - eventDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return 'just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? Replies will be preserved.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(event.id),
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}>
      <View style={styles.content}>
        <View style={styles.header}>
          {authorPhoto ? (
            <Image
              source={{uri: `data:image/jpeg;base64,${authorPhoto}`}}
              style={styles.authorPhoto}
            />
          ) : (
            <View style={[styles.authorPhoto, styles.authorPhotoPlaceholder]}>
              <Text style={styles.authorInitial}>
                {authorName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.postTime}>{formatTimeAgo(event.createdAt)}</Text>
          </View>
          {isOwnPost && onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete();
              }}>
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postContent}>{event.content}</Text>

        {/* Reply Actions - All posts have threads now */}
        {onViewReplies && (
          <View style={styles.threadActions}>
            <TouchableOpacity
              style={styles.threadButton}
              onPress={(e) => {
                e.stopPropagation();
                onViewReplies(event.id);
              }}>
              <Text style={styles.threadButtonText}>
                💬 {replyCount || 0} {replyCount === 1 ? 'Reply' : 'Replies'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  authorPhotoPlaceholder: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInitial: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  postTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  postContent: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
  },
  threadActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  threadButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
  },
  threadButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  deleteButtonText: {
    fontSize: 20,
  },
});

export default EventCard;
