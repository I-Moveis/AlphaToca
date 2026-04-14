import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Setup and Configuration', () => {
  it('should have @faker-js/faker installed as a devDependency', () => {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.devDependencies).toHaveProperty('@faker-js/faker');
  });

  it('should have prisma.seed configured in package.json', () => {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson).toHaveProperty('prisma');
    expect(packageJson.prisma).toHaveProperty('seed');
    expect(packageJson.prisma.seed).toContain('ts-node');
  });
});
