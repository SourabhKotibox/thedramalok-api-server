import { adminAuditPlugin } from '../middlewares/adminAuditPlugin';
import { mediaLinkerPlugin } from '../middlewares/mediaLinkerPlugin';
import mongoose, { Schema, Document } from 'mongoose';

export interface IStory extends Document {
  title: string;
  description?: string;
  shortDescription?: string;
  thumbnail?: string;
  bannerImage?: string;
  coverImage?: string;
  author?: string;
  narrator?: string;
  category?: string;
  tags: string[];
  languages: mongoose.Types.ObjectId[];
  genres: mongoose.Types.ObjectId[];
  categories: mongoose.Types.ObjectId[];
  status: 'published' | 'draft' | 'processing' | 'moderation' | 'rejected';
  processingStatus?: 'queued' | 'processing' | 'ready' | 'failed';
  processingError?: string;
  rejectionReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  audioUrl: string;
  audioFile?: string;
  duration?: number;
  chapters?: Array<{
    title: string;
    audioUrl: string;
    duration: number;
    startTime?: number;
  }>;
  views: number;
  likes: number;
  shares: number;
  featured: boolean;
  trending: boolean;
  isNewContent: boolean;
  isExclusive: boolean;
  planRequired: 'free' | 'basic' | 'standard' | 'premium';
  ageRating: number;
  rating?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  seoImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StorySchema = new Schema<IStory>(
  {
    title: { type: String, required: true, index: true },
    description: String,
    shortDescription: String,
    thumbnail: String,
    bannerImage: String,
    coverImage: String,
    author: String,
    narrator: String,
    category: String,
    tags: { type: [String], default: [] },
    languages: [{ type: Schema.Types.ObjectId, ref: 'Language' }],
    genres: [{ type: Schema.Types.ObjectId, ref: 'Genre' }],
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    status: {
      type: String,
      enum: ['published', 'draft', 'processing', 'moderation', 'rejected'],
      default: 'draft',
    },
    processingStatus: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed'],
    },
    processingError: String,
    rejectionReason: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    approvedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    rejectedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    audioUrl: { type: String, required: true },
    audioFile: String,
    duration: Number,
    chapters: [
      {
        title: String,
        audioUrl: String,
        duration: Number,
        startTime: Number,
      },
    ],
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    trending: { type: Boolean, default: false },
    isNewContent: { type: Boolean, default: false },
    isExclusive: { type: Boolean, default: false },
    planRequired: {
      type: String,
      enum: ['free', 'basic', 'standard', 'premium'],
      default: 'free',
    },
    ageRating: { type: Number, default: 0 },
    rating: String,
    slug: String,
    metaTitle: String,
    metaDescription: String,
    seoImage: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

StorySchema.plugin(adminAuditPlugin);
StorySchema.plugin(mediaLinkerPlugin);

export const StoryModel = mongoose.model<IStory>('Story', StorySchema);
