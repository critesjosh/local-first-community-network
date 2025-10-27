import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {ThreadReply} from '../../types/models';

interface ThreadReplyCardProps {
  reply: ThreadReply;
  authorName: string;
  authorPhoto?: string;
}

const ThreadReplyCard: React.FC<ThreadReplyCardProps> = ({
  reply,
  authorName,
  authorPhoto,
}) => {
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const replyDate = new Date(date);
    const diffInMs = now.getTime() - replyDate.getTime();
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

  return (
    <View style={styles.card}>
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
          <Text style={styles.postTime}>{formatTimeAgo(reply.createdAt)}</Text>
        </View>
      </View>

      <Text style={styles.replyContent}>{reply.content}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    marginLeft: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  authorPhotoPlaceholder: {
    backgroundColor: '#6C757D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInitial: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  postTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
  replyContent: {
    fontSize: 15,
    color: '#000',
    lineHeight: 20,
  },
});

export default ThreadReplyCard;
